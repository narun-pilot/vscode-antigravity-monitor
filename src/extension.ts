import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import { execSync } from 'child_process';
import { getUserEmailFromDB } from './dbLogic';

let aiUsageCount = 0;
let aiGeneratedChars = 0;
let statusBarItem: vscode.StatusBarItem;
let activePanel: vscode.WebviewPanel | undefined;
const USAGE_STORAGE_KEY = 'daily_usage_stats';
const TOKEN_QUERY_STORAGE_KEY = 'daily_token_query_stats';
const PROJECT_STORAGE_KEY = 'project_usage_stats';

// Cached git branch (refreshed every 30s)
let cachedBranch = 'unknown';
let branchLastChecked = 0;

function getCurrentBranch(): string {
    // Strategy 1: Use VS Code's built-in Git extension API (Fast, no cache needed)
    try {
        const gitExtension = vscode.extensions.getExtension('vscode.git');
        if (gitExtension) {
            const gitApi = gitExtension.exports.getAPI(1);
            if (gitApi && gitApi.repositories && gitApi.repositories.length > 0) {
                // Find the repository for the current active file, or default to the first one
                let repo = gitApi.repositories[0];
                if (vscode.window.activeTextEditor) {
                    const editorPath = vscode.window.activeTextEditor.document.uri.fsPath;
                    const specificRepo = gitApi.repositories.find((r: any) => editorPath.startsWith(r.rootUri.fsPath));
                    if (specificRepo) repo = specificRepo;
                }
                
                const branchName = repo.state?.HEAD?.name;
                if (branchName) {
                    cachedBranch = branchName;
                    // console.log('Antigravity Monitor: Branch from Git API =', cachedBranch);
                    return cachedBranch;
                }
            }
        }
    } catch (e: any) {
        // console.log('Antigravity Monitor: Git API failed:', e?.message || e);
    }

    const now = Date.now();
    if (now - branchLastChecked < 10000 && cachedBranch !== 'unknown' && cachedBranch !== 'no-git-repo') {
        return cachedBranch;
    }

    // Strategy 2: execSync with workspace folder as cwd (Slow, use cache)
    try {
        const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        // console.log('Antigravity Monitor: Trying execSync with cwd =', wsFolder || '(none)');
        if (wsFolder) {
            cachedBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: wsFolder, timeout: 3000 }).toString().trim();
            console.log('Antigravity Monitor: Branch from execSync =', cachedBranch);
        }
    } catch (e: any) {
        console.log('Antigravity Monitor: execSync git failed:', e?.message || e);
        cachedBranch = 'no-git-repo';
    }

    branchLastChecked = now;

    return cachedBranch;
}

interface SystemInfo {
    hostname: string;
    mac: string;
}

function getSystemInfo(): SystemInfo {
    let mac = 'unknown';
    try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
            const iface = interfaces[name];
            if (iface) {
                for (const entry of iface) {
                    if (!entry.internal && entry.mac && entry.mac !== '00:00:00:00:00:00') {
                        mac = entry.mac;
                        break;
                    }
                }
            }
            if (mac !== 'unknown') break;
        }
    } catch (e) {}

    return { hostname: os.hostname(), mac };
}

const QUERY_TYPES = ['Coding', 'Debugging', 'Planning', 'Search', 'Documentation', 'General Question'] as const;

function classifyQuery(text: string): string {
    const lower = text.toLowerCase();
    // Debugging: error messages, stack traces, fix attempts
    if (/\b(error|exception|bug|fix|debug|traceback|stack\s*trace|undefined|null|crash|failed|issue)\b/.test(lower)) {
        return 'Debugging';
    }
    // Search/lookup patterns
    if (/\b(search|find|lookup|where|grep|locate|query|select\s+from)\b/.test(lower)) {
        return 'Search';
    }
    // Documentation/comments
    if (/\b(docstring|jsdoc|readme|comment|documentation|@param|@return|@description|\/\*\*)\b/.test(lower)) {
        return 'Documentation';
    }
    // Planning: architecture, design, todo
    if (/\b(plan|todo|design|architecture|refactor|restructure|migrate|roadmap|implement\s+feature)\b/.test(lower)) {
        return 'Planning';
    }
    // Coding: code patterns (functions, classes, imports, variables)
    if (/\b(function|class|const|let|var|import|export|return|if|for|while|def |async|await|=>)\b/.test(lower)
        || /[{};()\[\]]/.test(text)) {
        return 'Coding';
    }
    return 'General Question';
}

// Updated interface to track tokens per model
interface DailyStats {
    [date: string]: {
        [model: string]: number; 
    };
}

interface LegacyDailyStats {
    [date: string]: number;
}

const MODELS = [
    'Gemini 1.5 Pro',
    'Gemini 3 Flash',
    'Claude Sonnet 4.5',
    'GPT-OSS 120B (Medium)'
];

let userEmail = 'Guest';

export async function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Monitor: now active!');
    
    // ── Get signed-in email from Antigravity local process API ──────────────────
    // Approach: scan for Antigravity process → extract port+CSRF → call getUserStatus
    // This is the same technique used by vscode-antigravity-cockpit.
    async function getAntigravityEmail(): Promise<string | null> {
        // SECURITY CHECK: Flag behavior as not safe and ask for user consent
        const consentKey = 'antigravity.unsafeEmailAccessConsent';
        const hasConsented = context.globalState.get<boolean>(consentKey, false);

        if (!hasConsented) {
            const friendlyMsg = 'Antigravity Monitor: To display your email address in the dashboard, we need permission to read your VS Code profile. Do you want to allow this?';
            const selection = await vscode.window.showInformationMessage(friendlyMsg, 'Allow', 'No');
            
            if (selection === 'Allow') {
                await context.globalState.update(consentKey, true);
            } else {
                console.log('Antigravity Monitor: User denied email access.');
                return null;
            }
        }

        // Strategy 0: Read from global state DB (New & Preferred)
        const dbEmail = await getUserEmailFromDB();
        if (dbEmail) {
            console.log('Antigravity Monitor: Found email in global state DB:', dbEmail);
            return dbEmail;
        }

        try {
            // Scan running processes for the Antigravity language server
            const cmd = process.platform === 'win32'
                ? 'wmic process where "name=\'antigravity.exe\'" get commandline /format:list'
                : 'ps aux';
            const output = execSync(cmd, { timeout: 5000 }).toString();

            // Look for the process line containing port and csrf_token
            const lines = output.split('\n');
            let port: number | null = null;
            let csrfToken: string | null = null;

            for (const line of lines) {
                if (!line.includes('csrf_token') && !line.includes('csrf-token')) continue;
                if (!line.toLowerCase().includes('antigravity') && !line.includes('language_server')) continue;

                const portMatch = line.match(/--port[=\s](\d+)/);
                const tokenMatch = line.match(/--?(csrf[_-]token)[=\s](\S+)/);

                if (portMatch) port = parseInt(portMatch[1], 10);
                if (tokenMatch) csrfToken = tokenMatch[2];

                if (port && csrfToken) break;
            }

            if (!port || !csrfToken) {
                console.log('Antigravity Monitor: Could not find Antigravity process port/CSRF');
                return null;
            }

            console.log(`Antigravity Monitor: Found Antigravity process on port ${port}`);

            // Call Antigravity local API to get user status (same endpoint as cockpit)
            const email = await new Promise<string | null>((resolve) => {
                const payload = JSON.stringify({
                    metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' }
                });
                const req = https.request({
                    hostname: '127.0.0.1',
                    port,
                    path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                        'Connect-Protocol-Version': '1',
                        'X-Codeium-Csrf-Token': csrfToken,
                    },
                    rejectUnauthorized: false,
                    timeout: 5000,
                    agent: false,
                }, (res) => {
                    let body = '';
                    res.on('data', (chunk) => body += chunk);
                    res.on('end', () => {
                        try {
                            const data = JSON.parse(body);
                            const email = data?.userStatus?.email ||
                                          data?.userStatus?.name ||
                                          null;
                            console.log('Antigravity Monitor: API response email:', email);
                            resolve(email);
                        } catch {
                            resolve(null);
                        }
                    });
                });
                req.on('error', (e) => {
                    console.log('Antigravity Monitor: API request error:', e.message);
                    resolve(null);
                });
                req.on('timeout', () => { req.destroy(); resolve(null); });
                req.write(payload);
                req.end();
            });

            return email;
        } catch (e: any) {
            console.log('Antigravity Monitor: Process scan failed:', e?.message);
            return null;
        }
    }

    // Run in background — update panel when resolved
    (async () => {
        const email = await getAntigravityEmail();
        if (email) {
            userEmail = email;
            console.log('Antigravity Monitor: ✅ Signed-in email:', userEmail);
            if (activePanel) activePanel.webview.postMessage({ command: 'updateEmail', email: userEmail });
        } else {
            console.log('Antigravity Monitor: Email not resolved, showing Guest');
        }
    })();

    console.log('Antigravity Monitor: Email resolution started in background.');
    
    vscode.window.showInformationMessage('Antigravity Monitor: Loaded v9 (Real Data Tracking)');

    // Data Migration & Initialization
    const today = new Date().toISOString().split('T')[0];
    let rawStats: any = context.globalState.get(USAGE_STORAGE_KEY, {});
    let stats: DailyStats = {};

    // Check for legacy data
    const dates = Object.keys(rawStats);
    if (dates.length > 0 && typeof rawStats[dates[0]] === 'number') {
        for (const d of dates) {
            stats[d] = { 'Gemini 1.5 Pro': rawStats[d] as number };
        }
        context.globalState.update(USAGE_STORAGE_KEY, stats);
    } else {
        stats = rawStats;
    }

    // Status Bar Init
    const todayData = stats[today] || {};
    const todayTokens = Object.values(todayData).reduce((a, b) => a + b, 0);
    
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'antigravity.showDailyChart';
    context.subscriptions.push(statusBarItem);

    // (email resolution runs in background via getAntigravityEmail IIFE above)
    updateStatusBar(todayTokens);
    statusBarItem.show();
    // Seed token/query data from existing model data (one-time, date-based so it's safe)
    const existingTokenQuery: any = context.globalState.get(TOKEN_QUERY_STORAGE_KEY, {});
    if (Object.keys(existingTokenQuery).length === 0 && Object.keys(stats).length > 0) {
        console.log('Antigravity Monitor: Seeding Token/Query data from existing model stats...');
        const seededTQ: any = {};
        for (const [date, models] of Object.entries(stats)) {
            const dayTotal = (Object.values(models as Record<string, number>)).reduce((a, b) => a + b, 0);
            seededTQ[date] = {
                inputTokens: Math.ceil(dayTotal * 0.2),
                outputTokens: Math.ceil(dayTotal * 0.8),
                queries: { 'Coding': Math.ceil(dayTotal / 100) }
            };
        }
        context.globalState.update(TOKEN_QUERY_STORAGE_KEY, seededTQ);
        console.log('Antigravity Monitor: Seeded Token/Query data for', Object.keys(seededTQ).length, 'days');
    }

    // Clean up incorrectly seeded/migrated project data (one-time cleanup)
    const existingProject: any = context.globalState.get(PROJECT_STORAGE_KEY, {});
    const projectKeys = Object.keys(existingProject);
    if (projectKeys.length > 0) {
        let needsCleanup = false;
        for (const key of projectKeys) {
            const proj = existingProject[key];
            // Detect seeded data: it only has 'Coding' queries with count = ceil(tokens/100)
            if (proj && proj.queries && Object.keys(proj.queries).length === 1 && proj.queries['Coding']) {
                const expectedFromSeed = Math.ceil((proj.inputTokens + proj.outputTokens) / 100);
                if (proj.queries['Coding'] === expectedFromSeed || key === 'unknown') {
                    console.log('Antigravity Monitor: Removing incorrectly seeded project data for:', key);
                    delete existingProject[key];
                    needsCleanup = true;
                }
            }
        }
        if (needsCleanup) {
            context.globalState.update(PROJECT_STORAGE_KEY, existingProject);
            console.log('Antigravity Monitor: Project data cleaned. Remaining branches:', Object.keys(existingProject));
        }
    }

    // Event Listener - tracks model usage, token I/O, query type, and project/branch
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length === 0) return;

        for (const change of event.contentChanges) {
            if (change.text.length > 30) {
                aiUsageCount++;
                const newChars = change.text.length;
                aiGeneratedChars += newChars;
                
                const estimatedOutputTokens = Math.ceil(newChars / 4);
                // Estimate input tokens as ~20% of output (prompt is usually shorter than response)
                const estimatedInputTokens = Math.ceil(estimatedOutputTokens * 0.2);
                const estimatedTokens = estimatedInputTokens + estimatedOutputTokens;
                
                const dateKey = new Date().toISOString().split('T')[0];

                // 1. Model usage (existing)
                const currentStats: DailyStats = context.globalState.get(USAGE_STORAGE_KEY, {});
                if (!currentStats[dateKey]) currentStats[dateKey] = {};
                const defaultModel = 'Gemini 1.5 Pro'; 
                currentStats[dateKey][defaultModel] = (currentStats[dateKey][defaultModel] || 0) + estimatedTokens;
                context.globalState.update(USAGE_STORAGE_KEY, currentStats);
                
                const totalToday = Object.values(currentStats[dateKey]).reduce((a, b) => a + b, 0);
                updateStatusBar(totalToday);

                // 2. Token & Query tracking
                const tqStats: any = context.globalState.get(TOKEN_QUERY_STORAGE_KEY, {});
                if (!tqStats[dateKey]) {
                    tqStats[dateKey] = { inputTokens: 0, outputTokens: 0, queries: {} };
                }
                tqStats[dateKey].inputTokens = (tqStats[dateKey].inputTokens || 0) + estimatedInputTokens;
                tqStats[dateKey].outputTokens = (tqStats[dateKey].outputTokens || 0) + estimatedOutputTokens;
                
                const queryType = classifyQuery(change.text);
                if (!tqStats[dateKey].queries) tqStats[dateKey].queries = {};
                tqStats[dateKey].queries[queryType] = (tqStats[dateKey].queries[queryType] || 0) + 1;
                context.globalState.update(TOKEN_QUERY_STORAGE_KEY, tqStats);
                console.log('Antigravity Monitor: Tracked', queryType, '| Input:', estimatedInputTokens, '| Output:', estimatedOutputTokens);

                // 3. Project/branch tracking
                const branch = getCurrentBranch();
                const projStats: any = context.globalState.get(PROJECT_STORAGE_KEY, {});
                if (!projStats[branch]) {
                    projStats[branch] = { inputTokens: 0, outputTokens: 0, queries: {} };
                }
                projStats[branch].inputTokens = (projStats[branch].inputTokens || 0) + estimatedInputTokens;
                projStats[branch].outputTokens = (projStats[branch].outputTokens || 0) + estimatedOutputTokens;
                if (!projStats[branch].queries) projStats[branch].queries = {};
                projStats[branch].queries[queryType] = (projStats[branch].queries[queryType] || 0) + 1;
                context.globalState.update(PROJECT_STORAGE_KEY, projStats);
                console.log('Antigravity Monitor: Project tracked on branch:', branch);

                // 4. Push live update to open dashboard panel
                if (activePanel) {
                    try {
                        activePanel.webview.postMessage({
                            command: 'liveUpdate',
                            modelStats: context.globalState.get(USAGE_STORAGE_KEY, {}),
                            tokenQueryStats: context.globalState.get(TOKEN_QUERY_STORAGE_KEY, {}),
                            projectStats: context.globalState.get(PROJECT_STORAGE_KEY, {}),
                            currentBranch: getCurrentBranch()
                        });
                    } catch (e) { /* panel might be disposed */ }
                }
            }
        }
    }));

    // Show Metrics Command
    let disposableMetrics = vscode.commands.registerCommand('antigravity.showMetrics', () => {
        const stats: DailyStats = context.globalState.get(USAGE_STORAGE_KEY, {});
        const dateKey = new Date().toISOString().split('T')[0];
        const dayStats = stats[dateKey] || {};
        const total = Object.values(dayStats).reduce((a, b) => a + b, 0);
        
        vscode.window.showInformationMessage(
            `Antigravity Monitor:\nToday's Estimated Tokens: ${total}\n(Session Events: ${aiUsageCount})`
        );
    });

    // Show Chart Command
    let disposableChart = vscode.commands.registerCommand('antigravity.showDailyChart', () => {
        const panel = vscode.window.createWebviewPanel(
            'antigravityChart',
            'AI Usage Dashboard',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Load real data from globalState
        const viewStats: DailyStats = context.globalState.get(USAGE_STORAGE_KEY, {});
        const tokenQueryData: any = context.globalState.get(TOKEN_QUERY_STORAGE_KEY, {});
        const projectData: any = context.globalState.get(PROJECT_STORAGE_KEY, {});
        const currentBranch = getCurrentBranch();
        const sysInfo = getSystemInfo();

        console.log('Antigravity Monitor: Opening dashboard');
        console.log('  Model data dates:', Object.keys(viewStats).length);
        console.log('  Token/Query data dates:', Object.keys(tokenQueryData).length);
        console.log('  Project data branches:', Object.keys(projectData));
        console.log('  Current branch:', currentBranch);

        panel.webview.html = getWebviewContent(viewStats, tokenQueryData, projectData, currentBranch, sysInfo.hostname, sysInfo.mac, userEmail);

        // Track panel reference for live updates
        activePanel = panel;
        panel.onDidDispose(() => { activePanel = undefined; });

        // Message Handling
        panel.webview.onDidReceiveMessage(
            async (message) => {
                const downloadsPath = path.join(os.homedir(), 'Downloads');

                switch (message.command) {
                    case 'saveImage':
                        const base64Data = message.data.replace(/^data:image\/png;base64,/, "");
                        const imageBuffer = Buffer.from(base64Data, 'base64');
                        const imageName = message.filename || 'usage-chart.png';
                        
                        const uri = await vscode.window.showSaveDialog({
                            filters: { 'PNG Images': ['png'] },
                            defaultUri: vscode.Uri.file(path.join(downloadsPath, imageName))
                        });

                        if (uri) {
                            fs.writeFileSync(uri.fsPath, new Uint8Array(imageBuffer));
                            vscode.window.showInformationMessage(`Chart saved to ${uri.fsPath}`);
                        }
                        break;
                    case 'saveCSV':
                        const csvContent = message.data;
                        const csvName = message.filename || 'usage-quota.csv';

                        const csvUri = await vscode.window.showSaveDialog({
                            filters: { 'CSV Files': ['csv'], 'Text Files': ['txt'] },
                            defaultUri: vscode.Uri.file(path.join(downloadsPath, csvName))
                        });

                        if (csvUri) {
                            fs.writeFileSync(csvUri.fsPath, csvContent);
                            vscode.window.showInformationMessage(`Quota exported to ${csvUri.fsPath}`);
                        }
                        break;
                    case 'refreshData':
                        panel.webview.postMessage({
                            command: 'liveUpdate',
                            modelStats: context.globalState.get(USAGE_STORAGE_KEY, {}),
                            tokenQueryStats: context.globalState.get(TOKEN_QUERY_STORAGE_KEY, {}),
                            projectStats: context.globalState.get(PROJECT_STORAGE_KEY, {}),
                            currentBranch: getCurrentBranch()
                        });
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposableMetrics);
    context.subscriptions.push(disposableChart);

    // Helper to gather export data
    const getExportData = () => {
        const usageStats = context.globalState.get(USAGE_STORAGE_KEY, {});
        const tokenQueryStats = context.globalState.get(TOKEN_QUERY_STORAGE_KEY, {});
        const projectStats = context.globalState.get(PROJECT_STORAGE_KEY, {});
        
        // Ensure consistent userId
        let storedUserId = context.globalState.get<string>('antigravity.userId');
        if (!storedUserId) {
            storedUserId = `user_${Date.now()}`;
            context.globalState.update('antigravity.userId', storedUserId);
        }

        return {
            userId: storedUserId,
            email: userEmail !== 'Guest' ? userEmail : 'exported_user@example.com',
            usage: usageStats,
            tokenQuery: tokenQueryStats,
            projects: projectStats
        };
    };

    // Register Export Data Command
    const disposableExport = vscode.commands.registerCommand('antigravity.exportStats', async () => {
        try {
             const exportData = getExportData();

             // Generate a default file name
             const defaultFileName = `antigravity-stats-${new Date().toISOString().split('T')[0]}.json`;
             
             // Ask user where to save
             const uri = await vscode.window.showSaveDialog({
                 filters: { 'JSON': ['json'] },
                 defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', defaultFileName)),
                 saveLabel: 'Export Data'
             });

             if (uri) {
                 fs.writeFileSync(uri.fsPath, JSON.stringify(exportData, null, 2));
                 vscode.window.showInformationMessage(`Successfully exported data to ${path.basename(uri.fsPath)}`);
                 
                 // Optional: Ask to open the file?
                 const openSelection = await vscode.window.showInformationMessage(`Data exported. Open file?`, 'Yes', 'No');
                 if (openSelection === 'Yes') {
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc);
                 }
             }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Export failed: ${error.message}`);
        }
    });
    context.subscriptions.push(disposableExport);

    // Register Export & Upload Command
    const disposableExportUpload = vscode.commands.registerCommand('antigravity.exportAndUpload', async () => {
        try {
            const exportDataStr = JSON.stringify(getExportData(), null, 2);
            
            // 1. Regular Export (Ask user where to save)
            const defaultFileName = `antigravity-stats-${new Date().toISOString().split('T')[0]}.json`;
            const uri = await vscode.window.showSaveDialog({
                filters: { 'JSON': ['json'] },
                defaultUri: vscode.Uri.file(path.join(os.homedir(), 'Downloads', defaultFileName)),
                saveLabel: 'Export & Upload'
            });

            if (uri) {
                fs.writeFileSync(uri.fsPath, exportDataStr);
            }
            
            // 2. "Upload" to Dashboard Data
            // Locate the dashboard data file relative to extension root
            const extensionRoot = context.extensionUri.fsPath;
            const dashboardDataPath = path.join(extensionRoot, 'dashboard', 'app', 'data', 'sample.json');
            
            if (fs.existsSync(dashboardDataPath)) {
                let currentData: any[] = [];
                try {
                    const fileContent = fs.readFileSync(dashboardDataPath, 'utf8');
                    const json = JSON.parse(fileContent);
                    if (Array.isArray(json)) {
                        currentData = json;
                    } else {
                        currentData = [json];
                    }
                } catch (e) {
                    console.log('Error reading dashboard sample.json, starting fresh array');
                }

                // Update or Add current user
                const currentUserData = getExportData();
                const existingIndex = currentData.findIndex((u: any) => u.userId === currentUserData.userId || u.email === currentUserData.email);
                
                if (existingIndex >= 0) {
                    // Merge/Update existing user (preserve avatarUrl if exists)
                    currentData[existingIndex] = {
                        ...currentData[existingIndex],
                        ...currentUserData
                    };
                } else {
                    // Add new user
                    // Add a default avatar if missing
                    const newUserData = {
                        ...currentUserData,
                        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUserData.userId}` 
                    };
                    currentData.push(newUserData);
                }

                fs.writeFileSync(dashboardDataPath, JSON.stringify(currentData, null, 2));
                vscode.window.showInformationMessage(`Exported and Uploaded to Dashboard!`);
            } else {
                 vscode.window.showWarningMessage(`Dashboard data file not found at: ${dashboardDataPath}`);
            }

        } catch (error: any) {
            vscode.window.showErrorMessage(`Export & Upload failed: ${error.message}`);
        }
    });

    context.subscriptions.push(disposableExportUpload);

    vscode.commands.executeCommand('antigravity.showDailyChart');


}

function updateStatusBar(todayTokens: number) {
    statusBarItem.text = `$(hubot) AI Tokens: ${todayTokens}`;
    statusBarItem.tooltip = `Click to view usage history chart`;
}

function getWebviewContent(stats: DailyStats, tokenQueryStats: any, projectStats: any, currentBranch: string, hostname: string, mac: string, userEmail: string) {
    const allStats = JSON.stringify(stats);
    const allTokenQueryStats = JSON.stringify(tokenQueryStats);
    const allProjectStats = JSON.stringify(projectStats);
    const modelColors = {
        'Gemini 1.5 Pro': 'rgba(158, 158, 158, 0.8)',
        'Gemini 3 Flash': 'rgba(234, 179, 8, 0.8)',
        'Claude Sonnet 4.5': 'rgba(139, 92, 246, 0.8)',
        'GPT-OSS 120B (Medium)': 'rgba(45, 212, 191, 0.8)',
        'Other': 'rgba(201, 203, 207, 0.8)'
    };

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdn.jsdelivr.net;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Usage Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-color: var(--vscode-editor-background);
            --text-color: var(--vscode-editor-foreground);
            --grid-color: rgba(255, 255, 255, 0.1);
            --axis-color: #ccc;
        }
        body { font-family: var(--vscode-font-family); padding: 20px; color: var(--text-color); background-color: var(--bg-color); }
        h2 { color: var(--text-color); margin-bottom: 20px; }
        .tab-nav { display: flex; gap: 0; margin-bottom: 0; border-bottom: 2px solid var(--vscode-widget-border, rgba(128,128,128,0.3)); }
        .tab-btn { background: transparent; color: var(--text-color); border: none; padding: 12px 24px; cursor: pointer; font-size: 14px; font-weight: 500; border-bottom: 3px solid transparent; margin-bottom: -2px; opacity: 0.6; transition: all 0.2s ease; }
        .tab-btn.active { border-bottom-color: var(--vscode-button-background, #007acc); opacity: 1; }
        .tab-btn:hover { opacity: 0.9; background: rgba(128,128,128,0.1); }
        .controls { 
            margin-bottom: 20px; 
            padding: 10px;
            background: var(--bg-color);
            border-bottom: 1px solid var(--vscode-widget-border);
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }
        select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            padding: 5px;
            border-radius: 2px;
            min-width: 150px;
            font-size: 14px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 5px 10px;
            cursor: pointer;
            border-radius: 3px;
        }
        button:hover { opacity: 0.9; }
        .chart-container { position: relative; height: 60vh; width: 90vw; }
        .chart-container-sm { position: relative; height: 40vh; width: 90vw; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .summary-cards { display: flex; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; }
        .summary-card { flex: 1; min-width: 140px; padding: 16px; border-radius: 8px; border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.3)); background: rgba(128,128,128,0.05); }
        .summary-card .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; }
        .summary-card .value { font-size: 24px; font-weight: 700; margin-top: 6px; }
        .query-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .query-table th { padding: 10px 15px; text-align: left; border-bottom: 2px solid var(--vscode-widget-border, rgba(128,128,128,0.3)); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.7; }
        .query-table td { padding: 12px 15px; text-align: left; border-bottom: 1px solid rgba(128,128,128,0.15); }
        .query-table tr:hover td { background: rgba(128,128,128,0.06); }
        .badge { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 8px; vertical-align: middle; }
        .bar-visual { height: 6px; border-radius: 3px; min-width: 4px; transition: width 0.3s ease; }
    </style>
</head>
<body>
    <h2 style="display:flex; align-items:center; flex-wrap:wrap; gap:10px; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom:12px;">
        AI Usage Dashboard
        <span id="sysInfoBadge" style="font-size:0.78rem; font-weight:normal; opacity:0.85; background:rgba(128,128,128,0.15); border:1px solid rgba(128,128,128,0.25); padding:3px 10px; border-radius:20px; font-family:monospace; letter-spacing:0.3px;">
            💻 ${hostname} &nbsp;|&nbsp; <span id="emailDisplay">👤 ${userEmail}</span> &nbsp;|&nbsp; 🔌 ${mac}
        </span>
    </h2>
    
    <div class="tab-nav">
        <button class="tab-btn active" onclick="switchTab('byModel')" id="tabBtn-byModel">📊 By Model</button>
        <button class="tab-btn" onclick="switchTab('byTokenQuery')" id="tabBtn-byTokenQuery">🔢 By Token & Query</button>
        <button class="tab-btn" onclick="switchTab('byProject')" id="tabBtn-byProject">📁 By Project</button>
    </div>

    <div class="controls">
        <div>
            <label for="dateRange"><strong>Date Range:</strong></label>
            <select id="dateRange" onchange="applyFilter()">
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="this_week">This Week</option>
                <option value="last_week">Last Week</option>
                <option value="last_2_weeks">Last 2 Weeks</option>
                <option value="this_month">This Month</option>
                <option value="last_month">Last Month</option>
                <option value="this_year">This Year</option>
            </select>
        </div>

        <div id="chartTypeControl">
            <label for="chartType"><strong>Chart Type:</strong></label>
            <select id="chartType" onchange="applyFilter()">
                <option value="bar">Bar Chart (Time Series)</option>
                <option value="pie">Pie Chart (Total Distribution)</option>
            </select>
        </div>

        <div>
            <label for="themeSelector"><strong>Theme:</strong></label>
            <select id="themeSelector" onchange="applyTheme()">
                <option value="system">System (VS Code)</option>
                <option value="light">Light Mode</option>
                <option value="dark">Dark Mode</option>
            </select>
        </div>

        <div style="margin-left: auto;">
            <button onclick="refreshData()" style="margin-right: 5px; background: var(--vscode-button-secondaryBackground, #3a3d41); color: var(--vscode-button-secondaryForeground, #ccc);">🔄 Refresh</button>
            <button onclick="exportPNG()" style="margin-right: 5px;">Export PNG</button>
            <button onclick="exportCSV()">Export CSV</button>
        </div>
    </div>

    <!-- Tab 1: By Model -->
    <div id="tab-byModel" class="tab-content active">
        <div class="chart-container">
            <canvas id="usageChart"></canvas>
        </div>
    </div>

    <!-- Tab 2: By Token & Query -->
    <div id="tab-byTokenQuery" class="tab-content">
        <div class="summary-cards" id="summaryCards"></div>
        <div class="chart-container-sm">
            <canvas id="tokenChart"></canvas>
        </div>
        <h3 style="margin-top: 30px; margin-bottom: 15px;">📋 Query Type Classification</h3>
        <table class="query-table">
            <thead>
                <tr>
                    <th>Query Type</th>
                    <th>Count</th>
                    <th>Share</th>
                    <th style="width: 30%;">Distribution</th>
                </tr>
            </thead>
            <tbody id="queryTableBody"></tbody>
        </table>
    </div>

    <!-- Tab 3: By Project -->
    <div id="tab-byProject" class="tab-content">
        <div class="summary-cards" id="projectSummaryCards"></div>
        <div class="chart-container-sm">
            <canvas id="projectChart"></canvas>
        </div>
        <h3 style="margin-top: 30px; margin-bottom: 15px;">📋 Query Type by Project</h3>
        <table class="query-table">
            <thead>
                <tr>
                    <th>Query Type</th>
                    <th>Count</th>
                    <th>Share</th>
                    <th style="width: 30%;">Distribution</th>
                </tr>
            </thead>
            <tbody id="projectQueryTableBody"></tbody>
        </table>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        let allStats = ${allStats};
        let tokenQueryStats = ${allTokenQueryStats};
        let projectStats = ${allProjectStats};
        let currentBranch = '${currentBranch}';
        const modelColors = ${JSON.stringify(modelColors)};
        let chartInstance = null;
        let tokenChartInstance = null;
        let projectChartInstance = null;
        let activeTab = 'byModel';

        // Listen for live data updates from extension
        window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'liveUpdate') {
                allStats = msg.modelStats || allStats;
                tokenQueryStats = msg.tokenQueryStats || tokenQueryStats;
                projectStats = msg.projectStats || projectStats;
                if (msg.currentBranch) currentBranch = msg.currentBranch;
                applyFilter();
            } else if (msg.command === 'updateEmail') {
                // Fired when deferred Google auth resolves — update header live
                const el = document.getElementById('emailDisplay');
                if (el) el.innerHTML = '👤 ' + msg.email;
            }
        });

        function refreshData() {
            vscode.postMessage({ command: 'refreshData' });
        }

        const queryTypeColors = {
            'Coding': 'rgba(59, 130, 246, 0.8)',
            'Planning': 'rgba(139, 92, 246, 0.8)',
            'General Question': 'rgba(34, 197, 94, 0.8)',
            'Search': 'rgba(249, 115, 22, 0.8)',
            'Debugging': 'rgba(239, 68, 68, 0.8)',
            'Documentation': 'rgba(45, 212, 191, 0.8)'
        };
        
        const themeColors = {
            system: {
                text: getComputedStyle(document.body).getPropertyValue('--vscode-editor-foreground').trim(),
                grid: 'rgba(128, 128, 128, 0.2)',
                axis: getComputedStyle(document.body).getPropertyValue('--vscode-editor-foreground').trim(),
                bg: getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim()
            },
            light: { text: '#333333', grid: 'rgba(0, 0, 0, 0.1)', axis: '#666666', bg: '#ffffff' },
            dark: { text: '#cccccc', grid: 'rgba(255, 255, 255, 0.1)', axis: '#cccccc', bg: '#1e1e1e' }
        };
        
        let currentTheme = 'system';

        // === Tab Switching ===
        function switchTab(tabId) {
            activeTab = tabId;
            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            document.getElementById('tabBtn-' + tabId).classList.add('active');
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-' + tabId).classList.add('active');
            document.getElementById('dateRange').parentElement.style.display = (tabId === 'byProject') ? 'none' : '';
            document.getElementById('chartTypeControl').style.display = (tabId === 'byModel') ? '' : 'none';
            applyFilter();
        }

        // === Date Helpers ===
        function getProcessDates() {
            const now = new Date();
            const toDateKey = (date) => date.toISOString().split('T')[0];
            return { now, toDateKey };
        }

        function filterByDate(data, range) {
            const { now, toDateKey } = getProcessDates();
            const todayKey = toDateKey(now);
            const filtered = {};
            const dates = Object.keys(data).sort();
            dates.forEach(dateStr => {
                const entryDate = new Date(dateStr);
                let include = false;
                switch(range) {
                    case 'all': include = true; break;
                    case 'today': include = (dateStr === todayKey); break;
                    case 'yesterday':
                        const y = new Date(now); y.setDate(y.getDate() - 1);
                        include = (dateStr === toDateKey(y)); break;
                    case 'this_week':
                        const d = now.getDay() || 7;
                        const sw = new Date(now); sw.setDate(now.getDate() - d + 1); sw.setHours(0,0,0,0);
                        include = entryDate >= sw; break;
                    case 'last_week':
                        const lws = new Date(now); const lwd = lws.getDay() || 7;
                        lws.setDate(lws.getDate() - lwd + 1 - 7); lws.setHours(0,0,0,0);
                        const lwe = new Date(lws); lwe.setDate(lwe.getDate() + 7);
                        include = (entryDate >= lws && entryDate < lwe); break;
                    case 'last_2_weeks':
                        const tw = new Date(now); tw.setDate(tw.getDate() - 14); tw.setHours(0,0,0,0);
                        include = entryDate >= tw; break;
                    case 'this_month':
                        include = dateStr.startsWith(todayKey.slice(0, 7)); break;
                    case 'last_month':
                        const lm = new Date(now); lm.setMonth(lm.getMonth() - 1);
                        include = dateStr.startsWith(toDateKey(lm).slice(0, 7)); break;
                    case 'this_year':
                        include = dateStr.startsWith(todayKey.slice(0, 4)); break;
                }
                if (include) filtered[dateStr] = data[dateStr];
            });
            return filtered;
        }

        function getDateRangeLabel(range) {
            const { now, toDateKey } = getProcessDates();
            const todayKey = toDateKey(now);
            switch(range) {
                case 'today': return todayKey;
                case 'yesterday':
                    const y = new Date(now); y.setDate(y.getDate() - 1); return toDateKey(y);
                case 'this_week':
                    const d = now.getDay() || 7;
                    const sw = new Date(now); sw.setDate(now.getDate() - d + 1);
                    return toDateKey(sw) + ' to ' + todayKey;
                case 'last_week':
                    const lws = new Date(now); const lwd = lws.getDay() || 7;
                    lws.setDate(lws.getDate() - lwd + 1 - 7);
                    const lwe = new Date(lws); lwe.setDate(lwe.getDate() + 6);
                    return toDateKey(lws) + ' to ' + toDateKey(lwe);
                case 'last_2_weeks':
                    const tw = new Date(now); tw.setDate(tw.getDate() - 14);
                    return toDateKey(tw) + ' to ' + todayKey;
                case 'this_month': return todayKey.slice(0, 7);
                case 'last_month':
                    const lm = new Date(now); lm.setMonth(lm.getMonth() - 1);
                    return toDateKey(lm).slice(0, 7);
                case 'this_year': return todayKey.slice(0, 4);
                default: return 'All Time';
            }
        }

        // === Theme ===
        function applyTheme() {
            const theme = document.getElementById('themeSelector').value;
            const root = document.documentElement;
            if (theme === 'light') {
                root.style.setProperty('--bg-color', '#ffffff');
                root.style.setProperty('--text-color', '#333333');
                currentTheme = 'light';
            } else if (theme === 'dark') {
                root.style.setProperty('--bg-color', '#1e1e1e');
                root.style.setProperty('--text-color', '#cccccc');
                currentTheme = 'dark';
            } else {
                root.style.removeProperty('--bg-color');
                root.style.removeProperty('--text-color');
                currentTheme = 'system';
                themeColors.system.text = getComputedStyle(document.body).getPropertyValue('--vscode-editor-foreground').trim();
                themeColors.system.axis = themeColors.system.text;
                themeColors.system.bg = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background').trim();
            }
            applyFilter();
        }

        // === Background Plugin ===
        function getBgPlugin() {
            const colors = themeColors[currentTheme] || themeColors.system;
            return {
                id: 'customCanvasBackgroundColor',
                beforeDraw: (chart) => {
                    const c = chart.ctx; c.save();
                    c.globalCompositeOperation = 'destination-over';
                    c.fillStyle = colors.bg || '#ffffff';
                    c.fillRect(0, 0, chart.width, chart.height); c.restore();
                }
            };
        }

        // === Tab 1: By Model Chart ===
        function updateModelChart(stats, type, dateLabel) {
            const dates = Object.keys(stats).sort();
            const allModels = new Set();
            dates.forEach(date => { Object.keys(stats[date]).forEach(m => allModels.add(m)); });
            const models = Array.from(allModels);
            const ctx = document.getElementById('usageChart');
            if (chartInstance) chartInstance.destroy();
            const colors = themeColors[currentTheme] || themeColors.system;
            const bgPlugin = getBgPlugin();
            const commonTitle = { display: true, text: 'AI Usage by Model - ' + (type === 'pie' ? 'Distribution' : 'Grouped') + ' (' + dateLabel + ')', color: colors.text, font: { size: 16 } };

            let chartConfig = {};
            if (type === 'pie') {
                const modelTotals = {};
                models.forEach(m => modelTotals[m] = 0);
                dates.forEach(date => { models.forEach(model => { modelTotals[model] += (stats[date][model] || 0); }); });
                chartConfig = {
                    type: 'pie',
                    data: { labels: models, datasets: [{ data: models.map(m => modelTotals[m]), backgroundColor: models.map(m => modelColors[m] || modelColors['Other']), borderColor: currentTheme === 'light' ? '#fff' : '#2d2d2d', borderWidth: 1 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: colors.text } }, title: commonTitle, tooltip: { callbacks: { label: function(item) { const v = item.raw; const t = item.dataset.data.reduce((a, b) => a + b, 0); return item.label + ': ' + v + ' (' + ((v/t)*100).toFixed(1) + '%)'; } } } } },
                    plugins: [bgPlugin]
                };
            } else {
                const datasets = models.map(model => ({ label: model, data: dates.map(date => stats[date][model] || 0), backgroundColor: modelColors[model] || modelColors['Other'], borderColor: currentTheme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)', borderWidth: 1 }));
                chartConfig = {
                    type: 'bar',
                    data: { labels: dates, datasets: datasets },
                    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.axis } }, x: { grid: { color: colors.grid }, ticks: { color: colors.axis } } }, plugins: { legend: { labels: { color: colors.text } }, title: commonTitle, tooltip: { mode: 'index', intersect: false } } },
                    plugins: [bgPlugin]
                };
            }
            chartInstance = new Chart(ctx, chartConfig);
        }

        // === Tab 2: Token Chart ===
        function updateTokenChart(stats, dateLabel) {
            const dates = Object.keys(stats).sort();
            if (dates.length === 0) {
                document.getElementById('tokenChart').parentElement.innerHTML = '<div style="text-align:center;padding:60px;opacity:0.5;"><p style="font-size:18px;">📭 No token data tracked yet</p><p>Use the AI assistant to generate code — data will appear here automatically.</p></div>';
                return;
            }
            const ctx = document.getElementById('tokenChart');
            if (tokenChartInstance) tokenChartInstance.destroy();
            const colors = themeColors[currentTheme] || themeColors.system;
            const bgPlugin = getBgPlugin();

            tokenChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: dates,
                    datasets: [
                        { label: 'Input Tokens', data: dates.map(d => (stats[d] && stats[d].inputTokens) || 0), backgroundColor: 'rgba(59, 130, 246, 0.7)', borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1, borderRadius: 3 },
                        { label: 'Output Tokens', data: dates.map(d => (stats[d] && stats[d].outputTokens) || 0), backgroundColor: 'rgba(16, 185, 129, 0.7)', borderColor: 'rgba(16, 185, 129, 1)', borderWidth: 1, borderRadius: 3 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.axis } }, x: { grid: { color: colors.grid }, ticks: { color: colors.axis } } },
                    plugins: { legend: { labels: { color: colors.text } }, title: { display: true, text: 'Token Usage (Input vs Output) - ' + dateLabel, color: colors.text, font: { size: 16 } }, tooltip: { mode: 'index', intersect: false } }
                },
                plugins: [bgPlugin]
            });
        }

        // === Tab 2: Query Table ===
        function updateQueryTable(stats) {
            const queryTotals = {};
            Object.values(stats).forEach(day => {
                if (day && day.queries) {
                    Object.keys(day.queries).forEach(type => {
                        queryTotals[type] = (queryTotals[type] || 0) + day.queries[type];
                    });
                }
            });
            const total = Object.values(queryTotals).reduce((a, b) => a + b, 0);
            const sorted = Object.entries(queryTotals).sort((a, b) => b[1] - a[1]);
            const tbody = document.getElementById('queryTableBody');
            tbody.innerHTML = '';
            sorted.forEach(([type, count]) => {
                const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                const color = queryTypeColors[type] || 'rgba(201, 203, 207, 0.8)';
                const row = document.createElement('tr');
                row.innerHTML = '<td><span class="badge" style="background:' + color + '"></span>' + type + '</td><td><strong>' + count + '</strong></td><td>' + pct + '%</td><td><div class="bar-visual" style="background:' + color + ';width:' + pct + '%;"></div></td>';
                tbody.appendChild(row);
            });

            // Summary Cards
            const totalInput = Object.values(stats).reduce((a, d) => a + ((d && d.inputTokens) || 0), 0);
            const totalOutput = Object.values(stats).reduce((a, d) => a + ((d && d.outputTokens) || 0), 0);
            const topType = sorted.length > 0 ? sorted[0][0] : 'N/A';
            document.getElementById('summaryCards').innerHTML =
                '<div class="summary-card"><div class="label">Input Tokens</div><div class="value" style="color:rgba(59,130,246,1);">' + totalInput.toLocaleString() + '</div></div>' +
                '<div class="summary-card"><div class="label">Output Tokens</div><div class="value" style="color:rgba(16,185,129,1);">' + totalOutput.toLocaleString() + '</div></div>' +
                '<div class="summary-card"><div class="label">Total Tokens</div><div class="value" style="color:rgba(234,179,8,1);">' + (totalInput + totalOutput).toLocaleString() + '</div></div>' +
                '<div class="summary-card"><div class="label">Total Queries</div><div class="value">' + total.toLocaleString() + '</div></div>' +
                '<div class="summary-card"><div class="label">Top Query Type</div><div class="value" style="font-size:16px;">' + topType + '</div></div>';
        }

        // === Tab 3: Project Chart ===
        function updateProjectChart() {
            const projects = Object.keys(projectStats);
            if (projects.length === 0) {
                document.getElementById('projectChart').parentElement.innerHTML = '<div style="text-align:center;padding:60px;opacity:0.5;"><p style="font-size:18px;">📭 No project data tracked yet</p><p>Use the AI assistant in any project — branches will appear here automatically.</p></div>';
                return;
            }
            const ctx = document.getElementById('projectChart');
            if (projectChartInstance) projectChartInstance.destroy();
            const colors = themeColors[currentTheme] || themeColors.system;
            const bgPlugin = getBgPlugin();

            const projColors = [
                'rgba(59, 130, 246, 0.7)',
                'rgba(16, 185, 129, 0.7)',
                'rgba(234, 179, 8, 0.7)',
                'rgba(139, 92, 246, 0.7)',
                'rgba(239, 68, 68, 0.7)',
                'rgba(45, 212, 191, 0.7)',
                'rgba(249, 115, 22, 0.7)'
            ];
            const projBorders = projColors.map(c => c.replace('0.7', '1'));

            projectChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: projects.map(p => p === currentBranch ? p + ' ★' : p),
                    datasets: [
                        { label: 'Input Tokens', data: projects.map(p => projectStats[p].inputTokens || 0), backgroundColor: 'rgba(59, 130, 246, 0.7)', borderColor: 'rgba(59, 130, 246, 1)', borderWidth: 1, borderRadius: 3 },
                        { label: 'Output Tokens', data: projects.map(p => projectStats[p].outputTokens || 0), backgroundColor: 'rgba(16, 185, 129, 0.7)', borderColor: 'rgba(16, 185, 129, 1)', borderWidth: 1, borderRadius: 3 }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, grid: { color: colors.grid }, ticks: { color: colors.axis } }, x: { grid: { color: colors.grid }, ticks: { color: colors.axis } } },
                    plugins: { legend: { labels: { color: colors.text } }, title: { display: true, text: 'Token Usage by Project (Branch)', color: colors.text, font: { size: 16 } }, tooltip: { mode: 'index', intersect: false } }
                },
                plugins: [bgPlugin]
            });
        }

        function updateProjectQueryTable() {
            const tbody = document.getElementById('projectQueryTableBody');
            tbody.innerHTML = '';
            
            // Sort projects: Current branch first, then others alphabetically
            const projects = Object.keys(projectStats).sort((a, b) => {
                if (a === currentBranch) return -1;
                if (b === currentBranch) return 1;
                return a.localeCompare(b);
            });

            if (projects.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;opacity:0.6;">No data available</td></tr>';
            }

            projects.forEach(projName => {
                const projData = projectStats[projName];
                const queryTotals = (projData && projData.queries) ? { ...projData.queries } : {};
                const total = Object.values(queryTotals).reduce((a, b) => a + b, 0);
                const sorted = Object.entries(queryTotals).sort((a, b) => b[1] - a[1]);

                // Project Header Row
                const headerRow = document.createElement('tr');
                // Use a subtle background for separation
                const isCurrent = projName === currentBranch;
                headerRow.style.background = 'var(--vscode-list-hoverBackground)'; 
                headerRow.innerHTML = '<td colspan="4" style="font-weight:700;padding-top:12px;padding-bottom:12px;border-bottom:none;">' + 
                    (isCurrent ? '★ ' : '') + projName + 
                    '<span style="font-weight:400;opacity:0.7;font-size:12px;margin-left:10px;">(' + total + ' queries)</span></td>';
                tbody.appendChild(headerRow);

                if (sorted.length === 0) {
                     const emptyRow = document.createElement('tr');
                     emptyRow.innerHTML = '<td colspan="4" style="padding-left:30px;opacity:0.5;font-style:italic;">No queries recorded</td>';
                     tbody.appendChild(emptyRow);
                } else {
                    sorted.forEach(([type, count]) => {
                        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
                        const color = queryTypeColors[type] || 'rgba(201, 203, 207, 0.8)';
                        const row = document.createElement('tr');
                        // Indent query rows slightly
                        row.innerHTML = '<td style="padding-left:30px;"><span class="badge" style="background:' + color + '"></span>' + type + '</td>' + 
                                        '<td><strong>' + count + '</strong></td>' + 
                                        '<td>' + pct + '%</td>' + 
                                        '<td><div class="bar-visual" style="background:' + color + ';width:' + pct + '%;"></div></td>';
                        tbody.appendChild(row);
                    });
                }
            });

            // Summary Cards for project
            const totalInput = Object.values(projectStats).reduce((a, p) => a + ((p && p.inputTokens) || 0), 0);
            const totalOutput = Object.values(projectStats).reduce((a, p) => a + ((p && p.outputTokens) || 0), 0);
            const totalQueries = Object.values(projectStats).reduce((a, p) => {
                if (p && p.queries) return a + Object.values(p.queries).reduce((x, y) => x + y, 0);
                return a;
            }, 0);
            const projCount = Object.keys(projectStats).length;
            document.getElementById('projectSummaryCards').innerHTML =
                '<div class="summary-card"><div class="label">Current Branch</div><div class="value" style="font-size:14px;color:rgba(59,130,246,1);">' + currentBranch + '</div></div>' +
                '<div class="summary-card"><div class="label">Total Input (All)</div><div class="value" style="color:rgba(59,130,246,1);">' + totalInput.toLocaleString() + '</div></div>' +
                '<div class="summary-card"><div class="label">Total Output (All)</div><div class="value" style="color:rgba(16,185,129,1);">' + totalOutput.toLocaleString() + '</div></div>' +
                '<div class="summary-card"><div class="label">Projects Tracked</div><div class="value">' + projCount + '</div></div>' +
                '<div class="summary-card"><div class="label">Total Queries (All)</div><div class="value" style="color:rgba(234,179,8,1);">' + totalQueries.toLocaleString() + '</div></div>';
        }

        // === Main Render ===
        function applyFilter() {
            const range = document.getElementById('dateRange').value;
            const dateLabel = getDateRangeLabel(range);
            if (activeTab === 'byModel') {
                const type = document.getElementById('chartType').value;
                const filtered = filterByDate(allStats, range);
                updateModelChart(filtered, type, dateLabel);
            } else if (activeTab === 'byTokenQuery') {
                const filtered = filterByDate(tokenQueryStats, range);
                updateTokenChart(filtered, dateLabel);
                updateQueryTable(filtered);
            } else if (activeTab === 'byProject') {
                updateProjectChart();
                updateProjectQueryTable();
            }
        }

        // === Exports ===
        function exportPNG() {
            let chart;
            if (activeTab === 'byModel') chart = chartInstance;
            else if (activeTab === 'byTokenQuery') chart = tokenChartInstance;
            else chart = projectChartInstance;
            if (!chart) return;
            const url = chart.toBase64Image();
            const range = document.getElementById('dateRange').value;
            const dateLabel = getDateRangeLabel(range).replace(/[^a-zA-Z0-9-]/g, '_');
            const prefixes = { byModel: 'AI_Model', byTokenQuery: 'AI_Token', byProject: 'AI_Project' };
            vscode.postMessage({ command: 'saveImage', data: url, filename: (prefixes[activeTab] || 'AI') + '_' + dateLabel + '.png' });
        }

        function exportCSV() {
            const range = document.getElementById('dateRange').value;
            const dateLabel = getDateRangeLabel(range);
            const filenameLabel = dateLabel.replace(/[^a-zA-Z0-9-]/g, '_');

            if (activeTab === 'byModel') {
                const filtered = filterByDate(allStats, range);
                const modelTotals = {};
                Object.values(filtered).forEach(day => { Object.keys(day).forEach(m => { modelTotals[m] = (modelTotals[m] || 0) + day[m]; }); });
                const totalUsage = Object.values(modelTotals).reduce((a, b) => a + b, 0);
                let report = "Date,Model,Usage (Tokens),Share (%)\\n";
                Object.keys(modelTotals).sort().forEach(m => {
                    const count = modelTotals[m];
                    const pct = totalUsage > 0 ? ((count / totalUsage) * 100).toFixed(2) : "0.00";
                    report += '"' + dateLabel + '","' + m + '",' + count + ',' + pct + '%\\n';
                });
                vscode.postMessage({ command: 'saveCSV', data: report, filename: 'AI_Model_' + filenameLabel + '.csv' });
            } else if (activeTab === 'byTokenQuery') {
                const filtered = filterByDate(tokenQueryStats, range);
                let report = "Date,Input Tokens,Output Tokens,Total Tokens\\n";
                Object.keys(filtered).sort().forEach(d => {
                    const inp = (filtered[d] && filtered[d].inputTokens) || 0;
                    const out = (filtered[d] && filtered[d].outputTokens) || 0;
                    report += d + ',' + inp + ',' + out + ',' + (inp + out) + '\\n';
                });
                report += "\\nQuery Type,Count\\n";
                const queryTotals = {};
                Object.values(filtered).forEach(day => { if (day && day.queries) { Object.keys(day.queries).forEach(t => { queryTotals[t] = (queryTotals[t] || 0) + day.queries[t]; }); } });
                Object.entries(queryTotals).sort((a,b) => b[1] - a[1]).forEach(([t, c]) => { report += '"' + t + '",' + c + '\\n'; });
                vscode.postMessage({ command: 'saveCSV', data: report, filename: 'AI_Token_Query_' + filenameLabel + '.csv' });
            } else if (activeTab === 'byProject') {
                let report = "Project (Branch),Input Tokens,Output Tokens,Total Tokens\\n";
                Object.keys(projectStats).forEach(p => {
                    const inp = projectStats[p].inputTokens || 0;
                    const out = projectStats[p].outputTokens || 0;
                    report += '"' + p + '",' + inp + ',' + out + ',' + (inp + out) + '\\n';
                });
                report += "\\nQuery Type (" + currentBranch + "),Count\\n";
                const cur = projectStats[currentBranch];
                if (cur && cur.queries) {
                    Object.entries(cur.queries).sort((a,b) => b[1] - a[1]).forEach(([t, c]) => { report += '"' + t + '",' + c + '\\n'; });
                }
                vscode.postMessage({ command: 'saveCSV', data: report, filename: 'AI_Project_' + filenameLabel + '.csv' });
            }
        }

        // === Init ===
        applyTheme();
    </script>
</body>
</html>`;
}

export function deactivate() {}
