"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Dashboard;
const react_1 = require("react");
const recharts_1 = require("recharts");
const lucide_react_1 = require("lucide-react");
const clsx_1 = require("clsx");
const tailwind_merge_1 = require("tailwind-merge");
// --- Utils ---
function cn(...inputs) {
    return (0, tailwind_merge_1.twMerge)((0, clsx_1.clsx)(inputs));
}
// --- Icons Map ---
const QueryIcons = {
    'Coding': <lucide_react_1.Code className="w-4 h-4 text-blue-400"/>,
    'Debugging': <lucide_react_1.Bug className="w-4 h-4 text-red-400"/>,
    'Search': <lucide_react_1.Search className="w-4 h-4 text-orange-400"/>,
    'Planning': <lucide_react_1.Lightbulb className="w-4 h-4 text-yellow-400"/>,
    'Documentation': <lucide_react_1.FileText className="w-4 h-4 text-teal-400"/>,
    'General Question': <lucide_react_1.Zap className="w-4 h-4 text-green-400"/>
};
// --- Components ---
const Card = ({ children, className }) => (<div className={cn("bg-card border border-border/50 rounded-xl shadow-sm backdrop-blur-sm", className)}>
        {children}
    </div>);
const Metric = ({ label, value, trend, icon, color = "text-primary" }) => (<Card className="p-6 flex items-start justify-between hover:border-primary/50 transition-colors cursor-default group">
        <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">{value}</h2>
            {trend && <p className="text-xs text-green-400 mt-2 font-medium flex items-center gap-1">↑ {trend} vs last week</p>}
        </div>
        <div className={cn("p-3 rounded-lg bg-secondary/30 group-hover:bg-primary/20 transition-colors", color)}>
            {icon}
        </div>
    </Card>);
function Dashboard({ initialData }) {
    const [users, setUsers] = (0, react_1.useState)(initialData);
    const [selectedUserId, setSelectedUserId] = (0, react_1.useState)(null);
    const [viewMode, setViewMode] = (0, react_1.useState)('team');
    const [activeTab, setActiveTab] = (0, react_1.useState)('overview');
    const [dateFilter, setDateFilter] = (0, react_1.useState)('all');
    // Initialization Effect
    (0, react_1.useEffect)(() => {
        const storedUser = localStorage.getItem('last_selected_user');
        // If we have a stored user and current data supports it, load them.
        // BUT the requirement says: "from the second loading".
        // "On first load... overview of every developer".
        // This implies if NO stored user, go to team view.
        if (storedUser) {
            const userExists = initialData.find(u => u.userId === storedUser);
            if (userExists) {
                setSelectedUserId(storedUser);
                setViewMode('developer');
            }
            else {
                setViewMode('team');
            }
        }
        else {
            setViewMode('team');
        }
    }, [initialData]);
    const selectUser = (userId) => {
        setSelectedUserId(userId);
        setViewMode('developer');
        localStorage.setItem('last_selected_user', userId);
    };
    const currentUser = (0, react_1.useMemo)(() => users.find(u => u.userId === selectedUserId) || users[0], [users, selectedUserId]);
    // --- Enhanced Logic ---
    const totalTokens = (0, react_1.useMemo)(() => {
        if (!currentUser)
            return { input: 0, output: 0, total: 0 };
        let input = 0, output = 0;
        Object.values(currentUser.tokenQuery).forEach(d => { input += d.inputTokens; output += d.outputTokens; });
        return { input, output, total: input + output };
    }, [currentUser]);
    const mostUsedModel = (0, react_1.useMemo)(() => {
        if (!currentUser)
            return 'N/A';
        const counts = {};
        Object.values(currentUser.usage).forEach(day => {
            Object.entries(day).forEach(([m, c]) => counts[m] = (counts[m] || 0) + c);
        });
        return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
    }, [currentUser]);
    const chartData = (0, react_1.useMemo)(() => {
        if (!currentUser)
            return [];
        const data = Object.entries(currentUser.usage).map(([date, models]) => ({
            date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            rawDate: date,
            ...models
        })).sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());
        return data;
    }, [currentUser]);
    const queryDist = (0, react_1.useMemo)(() => {
        if (!currentUser)
            return [];
        const counts = {};
        Object.values(currentUser.tokenQuery).forEach(d => {
            Object.entries(d.queries).forEach(([q, c]) => counts[q] = (counts[q] || 0) + c);
        });
        return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [currentUser]);
    const projectStats = (0, react_1.useMemo)(() => {
        if (!currentUser)
            return [];
        return Object.entries(currentUser.projects).map(([name, stats]) => ({
            name,
            total: stats.inputTokens + stats.outputTokens,
            input: stats.inputTokens,
            output: stats.outputTokens,
            queries: stats.queries,
            topQuery: Object.entries(stats.queries).sort((a, b) => b[1] - a[1])[0]?.[0] || 'None'
        })).sort((a, b) => b.total - a.total);
    }, [currentUser]);
    // Colors
    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];
    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target?.result);
                    if (Array.isArray(json)) {
                        const userData = json.map((u, i) => ({
                            ...u,
                            userId: u.userId || `imported_${Date.now()}_${i}`,
                            email: u.email || `imported_user_${i}@example.com`
                        }));
                        setUsers(prev => [...prev, ...userData]);
                    }
                    else {
                        const newUser = { ...json, userId: json.userId || `imported_${Date.now()}`, email: json.email || 'imported@example.com' };
                        setUsers(prev => [...prev, newUser]);
                        selectUser(newUser.userId);
                    }
                }
                catch (err) {
                    alert("Invalid JSON");
                }
            };
            reader.readAsText(file);
        }
    };
    return (<div className="min-h-screen pb-12 bg-background text-foreground">
      
      {/* 1. Modern Navbar */}
      <nav className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
             <div className="flex items-center gap-3 cursor-pointer" onClick={() => setViewMode('team')}>
                 <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <lucide_react_1.Activity className="w-5 h-5 text-white"/>
                 </div>
                 <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Antigravity Monitor</h1>
             </div>

             <div className="flex items-center gap-4">
                 {/* Team View Button */}
                 <button onClick={() => setViewMode('team')} className={cn("flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors", viewMode === 'team' ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50")}>
                     <lucide_react_1.Grid className="w-4 h-4"/>
                     <span className="hidden sm:inline">Team Overview</span>
                 </button>

                 {/* User & Filter Controls */}
                 {viewMode === 'developer' && (<div className="relative group">
                        <select value={selectedUserId || ''} onChange={(e) => selectUser(e.target.value)} className="appearance-none bg-secondary/50 border border-border text-sm rounded-md pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 hover:bg-secondary transition-colors cursor-pointer min-w-[200px]">
                            {users.map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
                        </select>
                        <lucide_react_1.Users className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none"/>
                        <lucide_react_1.ChevronDown className="w-4 h-4 absolute right-2.5 top-2.5 text-muted-foreground pointer-events-none"/>
                     </div>)}
                 
                 <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors px-3 py-2 rounded-md hover:bg-secondary/50">
                    <lucide_react_1.Upload className="w-4 h-4"/>
                    <span className="hidden sm:inline">Import JSON</span>
                    <input type="file" className="hidden" accept=".json" onChange={handleFileUpload}/>
                 </label>
             </div>
          </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          
          {/* VIEW: TEAM OVERVIEW */}
          {viewMode === 'team' && (<div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <h2 className="text-2xl font-bold mb-6">Developer Team Overview</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {users.map((user) => {
                const uTotal = Object.values(user.tokenQuery).reduce((acc, d) => acc + d.inputTokens + d.outputTokens, 0);
                const uActiveDays = Object.keys(user.usage).length;
                const uProjectCount = Object.keys(user.projects).length;
                // Find top model
                const counts = {};
                Object.values(user.usage).forEach(day => Object.entries(day).forEach(([m, c]) => counts[m] = (counts[m] || 0) + c));
                const uTopModel = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
                return (<Card key={user.userId} className="p-6 hover:border-primary/50 cursor-pointer group transition-all hover:shadow-lg hover:shadow-indigo-500/10">
                                  <div onClick={() => selectUser(user.userId)}>
                                      <div className="flex items-start justify-between mb-4">
                                          <div className="flex items-center gap-3">
                                              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-lg">
                                                  {user.email[0].toUpperCase()}
                                              </div>
                                              <div>
                                                  <h3 className="font-semibold text-lg">{user.email.split('@')[0]}</h3>
                                                  <p className="text-xs text-muted-foreground">{user.email}</p>
                                              </div>
                                          </div>
                                          <lucide_react_1.ChevronDown className="w-5 h-5 text-muted-foreground -rotate-90 group-hover:text-primary transition-colors"/>
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-4 mt-6">
                                          <div className="bg-secondary/30 p-3 rounded-lg">
                                              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Usage</p>
                                              <p className="font-bold text-lg">{(uTotal / 1000).toFixed(1)}k</p>
                                          </div>
                                          <div className="bg-secondary/30 p-3 rounded-lg">
                                              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Active Projects</p>
                                              <p className="font-bold text-lg">{uProjectCount}</p>
                                          </div>
                                      </div>
                                      <div className="mt-4 pt-4 border-t border-border/30 flex justify-between items-center text-sm">
                                          <span className="text-muted-foreground">Top Model: <span className="text-foreground font-medium">{uTopModel.split(' ')[0]}</span></span>
                                          <span className="text-emerald-400 font-medium text-xs bg-emerald-400/10 px-2 py-1 rounded-full">Active Now</span>
                                      </div>
                                  </div>
                              </Card>);
            })}
                  </div>
              </div>)}

          {/* VIEW: SINGLE DEVELOPER DASHBOARD */}
          {viewMode === 'developer' && currentUser && (<>
                {/* 2. High-Level Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in">
                    <Metric label="Total Tokens" value={(totalTokens.total / 1000).toFixed(1) + 'k'} trend="12%" icon={<lucide_react_1.Database className="w-5 h-5"/>} color="text-indigo-400"/>
                    <Metric label="Active Sessions" value={queryDist.reduce((a, b) => a + b.value, 0).toLocaleString()} icon={<lucide_react_1.Zap className="w-5 h-5"/>} color="text-yellow-400"/>
                    <Metric label="Most Used Model" value={mostUsedModel.split(' ')[0]} icon={<lucide_react_1.Command className="w-5 h-5"/>} color="text-emerald-400"/>
                    <Metric label="Active Projects" value={projectStats.length} icon={<lucide_react_1.GitBranch className="w-5 h-5"/>} color="text-pink-400"/>
                </div>

                {/* 3. Navigation Tabs */}
                <div className="border-b border-border/40">
                    <div className="flex gap-6">
                        {[
                { id: 'overview', label: 'Overview', icon: lucide_react_1.LayoutDashboard },
                { id: 'projects', label: 'Project Breakdown', icon: lucide_react_1.Folder }
            ].map(tab => (<button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn("flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-all", activeTab === tab.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")}>
                                <tab.icon className="w-4 h-4"/>
                                {tab.label}
                            </button>))}
                    </div>
                </div>

                {/* 4. Content Area */}
                <div className="min-h-[500px]">

                    {/* VIEW: OVERVIEW */}
                    {activeTab === 'overview' && (<div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            
                            {/* Main Chart */}
                            <Card className="lg:col-span-2 p-6 flex flex-col">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="font-semibold text-lg">Usage Trends</h3>
                                        <p className="text-sm text-muted-foreground">Daily token consumption by model</p>
                                    </div>
                                    <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="bg-secondary/30 border border-border text-xs rounded px-2 py-1 outline-none">
                                        <option value="all">Last 30 Days</option>
                                        <option value="7days">Last 7 Days</option>
                                    </select>
                                </div>
                                <div className="h-[350px] w-full">
                                    <recharts_1.ResponsiveContainer width="100%" height="100%">
                                        <recharts_1.AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <recharts_1.CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.4}/>
                                            <recharts_1.XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}/>
                                            <recharts_1.YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`}/>
                                            <recharts_1.Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} itemStyle={{ color: '#f8fafc' }}/>
                                            {Object.keys(currentUser.usage[Object.keys(currentUser.usage)[0]] || {}).map((key, i) => (<recharts_1.Area key={key} type="monotone" dataKey={key} stackId="1" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.6}/>))}
                                        </recharts_1.AreaChart>
                                    </recharts_1.ResponsiveContainer>
                                </div>
                            </Card>

                            {/* Distribution Pie */}
                            <Card className="p-6">
                                <h3 className="font-semibold text-lg mb-1">Query Distribution</h3>
                                <p className="text-sm text-muted-foreground mb-6">Breakdown by task type</p>
                                <div className="h-[250px] relative">
                                    <recharts_1.ResponsiveContainer width="100%" height="100%">
                                        <recharts_1.PieChart>
                                            <recharts_1.Pie data={queryDist} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                                {queryDist.map((entry, index) => (<recharts_1.Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent"/>))}
                                            </recharts_1.Pie>
                                            <recharts_1.Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} itemStyle={{ color: '#f8fafc' }}/>
                                        </recharts_1.PieChart>
                                    </recharts_1.ResponsiveContainer>
                                    {/* Center Label */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="text-center">
                                            <span className="block text-2xl font-bold">{queryDist.reduce((a, b) => a + b.value, 0)}</span>
                                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Queries</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {queryDist.slice(0, 4).map((q, i) => (<div key={q.name} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}/>
                                                <span className="text-muted-foreground">{q.name}</span>
                                            </div>
                                            <span className="font-medium text-foreground">{q.value}</span>
                                        </div>))}
                                </div>
                            </Card>
                        </div>)}
                    
                    {/* VIEW: PROJECTS */}
                    {activeTab === 'projects' && (<div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* 1. Horizontal Bar Chart (Input vs Output per Project) */}
                                <Card className="p-6 h-[500px] flex flex-col">
                                    <h3 className="font-semibold text-lg mb-1">Project Token Usage</h3>
                                    <p className="text-sm text-muted-foreground mb-6">Input vs Output tokens per project</p>
                                    <div className="flex-1 w-full min-h-0">
                                        <recharts_1.ResponsiveContainer width="100%" height="100%">
                                            <recharts_1.BarChart data={projectStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                                <recharts_1.CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.4}/>
                                                <recharts_1.XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}/>
                                                <recharts_1.YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`}/>
                                                <recharts_1.Tooltip cursor={{ fill: '#334155', opacity: 0.2 }} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}/>
                                                <recharts_1.Legend wrapperStyle={{ paddingTop: '20px' }}/>
                                                <recharts_1.Bar dataKey="input" fill="#6366f1" name="Input Tokens" radius={[4, 4, 0, 0]}/>
                                                <recharts_1.Bar dataKey="output" fill="#10b981" name="Output Tokens" radius={[4, 4, 0, 0]}/>
                                            </recharts_1.BarChart>
                                        </recharts_1.ResponsiveContainer>
                                    </div>
                                </Card>

                                {/* 2. Query Type Table (Aggregated) */}
                                <Card className="p-6 h-[500px] flex flex-col overflow-hidden">
                                    <div className="mb-6">
                                        <h3 className="font-semibold text-lg mb-1">Query Type Breakdown</h3>
                                        <p className="text-sm text-muted-foreground">Distribution of tasks across all projects</p>
                                    </div>
                                    <div className="overflow-auto flex-1">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-secondary/30 text-muted-foreground uppercase text-xs font-semibold tracking-wider sticky top-0 back-drop-blur z-10">
                                                <tr>
                                                    <th className="px-4 py-3 font-medium">Project / Type</th>
                                                    <th className="px-4 py-3 font-medium text-right">Count</th>
                                                    <th className="px-4 py-3 font-medium text-right">Share</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/20">
                                                {/* @ts-ignore */}
                                                {projectStats.map((proj) => {
                    const totalProjectQueries = Object.values(proj.queries).reduce((a, b) => a + b, 0);
                    return (<>
                                                            {/* Project Header Row */}
                                                            <tr key={proj.name} className="bg-secondary/10">
                                                                <td colSpan={3} className="px-4 py-2 text-xs font-bold text-muted-foreground bg-muted/20 uppercase tracking-wider flex items-center gap-2">
                                                                    <lucide_react_1.GitBranch className="w-3 h-3"/>
                                                                    {proj.name}
                                                                    <span className="ml-auto font-normal opacity-70">Total: {totalProjectQueries}</span>
                                                                </td>
                                                            </tr>
                                                            {/* Query Type Rows */}
                                                            {/* @ts-ignore */}
                                                            {Object.entries(proj.queries).sort((a, b) => b[1] - a[1]).map(([qName, qCount]) => (<tr key={`${proj.name}-${qName}`} className="hover:bg-muted/10 transition-colors">
                                                                    <td className="px-4 py-3 font-medium flex items-center gap-2 pl-8">
                                                                        {QueryIcons[qName] || <lucide_react_1.Check className="w-4 h-4 text-gray-400"/>}
                                                                        {qName}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right font-mono">{qCount.toLocaleString()}</td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-secondary text-foreground">
                                                                            {/* @ts-ignore */}
                                                                            {((qCount / totalProjectQueries) * 100).toFixed(1)}%
                                                                        </span>
                                                                    </td>
                                                                </tr>))}
                                                        </>);
                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </div>
                        </div>)}
                </div>
            </>)}

      </main>
    </div>);
}
//# sourceMappingURL=Dashboard.js.map