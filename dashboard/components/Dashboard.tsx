
"use client"

import { useState, useMemo, useEffect } from 'react';
import { UserData } from '@/app/lib/types';
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area } from 'recharts';
import { 
  Upload, Users, LayoutDashboard, Database, Activity, GitBranch, 
  Calendar, Download, RefreshCw, Command, Zap, Search, Code, Bug, 
  FileText, Lightbulb, ChevronDown, Check, List, Folder, Grid,
  Trophy, Medal, Crown
} from 'lucide-react';
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

// --- Utils ---
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- Icons Map ---
const QueryIcons: Record<string, React.ReactNode> = {
    'Coding': <Code className="w-4 h-4 text-blue-400" />,
    'Debugging': <Bug className="w-4 h-4 text-red-400" />,
    'Search': <Search className="w-4 h-4 text-orange-400" />,
    'Planning': <Lightbulb className="w-4 h-4 text-yellow-400" />,
    'Documentation': <FileText className="w-4 h-4 text-teal-400" />,
    'General Question': <Zap className="w-4 h-4 text-green-400" />
};

// --- Components ---
const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("bg-card border border-border/50 rounded-xl shadow-sm backdrop-blur-sm", className)}>
        {children}
    </div>
);

const Metric = ({ label, value, trend, icon, color = "text-primary" }: any) => (
    <Card className="p-6 flex items-start justify-between hover:border-primary/50 transition-colors cursor-default group">
        <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
            <h2 className="text-3xl font-bold text-foreground tracking-tight">{value}</h2>
            {trend && <p className="text-xs text-green-400 mt-2 font-medium flex items-center gap-1">↑ {trend} vs last week</p>}
        </div>
        <div className={cn("p-3 rounded-lg bg-secondary/30 group-hover:bg-primary/20 transition-colors", color)}>
            {icon}
        </div>
    </Card>
);

interface DashboardProps {
  initialData: UserData[];
}

export default function Dashboard({ initialData }: DashboardProps) {
  const [users, setUsers] = useState<UserData[]>(initialData);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'team' | 'developer' | 'consolidate'>('team');
  const [activeTab, setActiveTab] = useState<'overview' | 'queries' | 'projects'>('overview');
  const [dateFilter, setDateFilter] = useState('all');

  // Initialization Effect
  useEffect(() => {
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
        } else {
            setViewMode('team');
        }
    } else {
        setViewMode('team');
    }
  }, [initialData]);

  const selectUser = (userId: string) => {
      setSelectedUserId(userId);
      setViewMode('developer');
      localStorage.setItem('last_selected_user', userId);
  };

  const currentUser = useMemo(() => 
    users.find(u => u.userId === selectedUserId) || users[0], 
    [users, selectedUserId]
  );
  
  // --- Enhanced Logic ---
  
  const totalTokens = useMemo(() => {
     if (!currentUser) return { input: 0, output: 0, total: 0 };
     let input = 0, output = 0;
     Object.values(currentUser.tokenQuery).forEach(d => { input += d.inputTokens; output += d.outputTokens; });
     return { input, output, total: input + output };
  }, [currentUser]);

  const mostUsedModel = useMemo(() => {
      if (!currentUser) return 'N/A';
      const counts: Record<string, number> = {};
      Object.values(currentUser.usage).forEach(day => {
          Object.entries(day).forEach(([m, c]) => counts[m] = (counts[m] || 0) + c);
      });
      return Object.entries(counts).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A';
  }, [currentUser]);

  const chartData = useMemo(() => {
      if (!currentUser) return [];
      const data = Object.entries(currentUser.usage).map(([date, models]) => ({
          date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          rawDate: date,
          ...models
      })).sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());
      
      return data;
  }, [currentUser]);

  const queryDist = useMemo(() => {
      if (!currentUser) return [];
      const counts: Record<string, number> = {};
      Object.values(currentUser.tokenQuery).forEach(d => {
          Object.entries(d.queries).forEach(([q, c]) => counts[q] = (counts[q] || 0) + c);
      });
      return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  }, [currentUser]);

  const projectStats = useMemo(() => {
     if (!currentUser) return [];
     return Object.entries(currentUser.projects).map(([name, stats]) => ({
         name,
         total: stats.inputTokens + stats.outputTokens,
         input: stats.inputTokens,
         output: stats.outputTokens,
         queries: stats.queries,
         topQuery: Object.entries(stats.queries).sort((a,b) => b[1] - a[1])[0]?.[0] || 'None'
     })).sort((a,b) => b.total - a.total);
  }, [currentUser]);

  // --- Consolidated Logic ---
  const consolidatedStats = useMemo(() => {
    let input = 0, output = 0, total = 0, queries = 0;
    const queryCounts: Record<string, number> = {};

    users.forEach(user => {
        Object.values(user.tokenQuery).forEach(day => {
            input += day.inputTokens;
            output += day.outputTokens;
            // Sum specific query counts
            Object.entries(day.queries).forEach(([q, c]) => {
                queries += c;
                queryCounts[q] = (queryCounts[q] || 0) + c;
            });
        });
    });
    
    total = input + output;
    
    // Sort query distribution
    const queryDist = Object.entries(queryCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    return { input, output, total, queries, queryDist };
  }, [users]);


  // Colors
  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          if (Array.isArray(json)) {
            const userData = json.map((u: any, i: number) => ({
                 ...u,
                 userId: u.userId || `imported_${Date.now()}_${i}`,
                 email: u.email || `imported_user_${i}@example.com`
             }));
             setUsers(prev => [...prev, ...userData]);
          } else {
             const newUser = { ...json, userId: json.userId || `imported_${Date.now()}`, email: json.email || 'imported@example.com' };
             setUsers(prev => [...prev, newUser]);
             selectUser(newUser.userId);
          }
        } catch (err) { alert("Invalid JSON"); }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="min-h-screen pb-12 bg-background text-foreground">
      
      {/* 1. Modern Navbar */}
      <nav className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
             <div className="flex items-center gap-3 cursor-pointer" onClick={() => setViewMode('team')}>
                 <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                    <Activity className="w-5 h-5 text-white" />
                 </div>
                 <h1 className="font-bold text-xl tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">Antigravity Monitor</h1>
             </div>

             <div className="flex items-center gap-4">
                 {/* Team View Button */}
                 <button 
                    onClick={() => setViewMode('team')}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                         viewMode === 'team' ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    )}
                 >
                     <Grid className="w-4 h-4" />
                     <span className="hidden sm:inline">Team Overview</span>
                 </button>

                 <button 
                    onClick={() => setViewMode('consolidate')}
                    className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                         viewMode === 'consolidate' ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    )}
                 >
                     <Trophy className="w-4 h-4" />
                     <span className="hidden sm:inline">Leaderboard</span>
                 </button>

                 {/* User & Filter Controls */}
                 {viewMode === 'developer' && (
                     <div className="relative group">
                        <select 
                            value={selectedUserId || ''}
                            onChange={(e) => selectUser(e.target.value)}
                            className="appearance-none bg-secondary/50 border border-border text-sm rounded-md pl-9 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 hover:bg-secondary transition-colors cursor-pointer min-w-[200px]"
                        >
                            {users.map(u => <option key={u.userId} value={u.userId}>{u.email}</option>)}
                        </select>
                        <Users className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
                        <ChevronDown className="w-4 h-4 absolute right-2.5 top-2.5 text-muted-foreground pointer-events-none" />
                     </div>
                 )}
                 
                 <label className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors px-3 py-2 rounded-md hover:bg-secondary/50">
                    <Upload className="w-4 h-4" />
                    <span className="hidden sm:inline">Import JSON</span>
                    <input type="file" className="hidden" accept=".json" onChange={handleFileUpload} />
                 </label>
             </div>
          </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          
          {/* VIEW: TEAM OVERVIEW */}
          {viewMode === 'team' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <h2 className="text-2xl font-bold mb-6">Developer Team Overview</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {users.map((user) => {
                          const uTotal = Object.values(user.tokenQuery).reduce((acc, d) => acc + d.inputTokens + d.outputTokens, 0);
                          const uActiveDays = Object.keys(user.usage).length;
                          const uProjectCount = Object.keys(user.projects).length;
                          // Find top model
                          const counts: Record<string, number> = {};
                          Object.values(user.usage).forEach(day => Object.entries(day).forEach(([m, c]) => counts[m] = (counts[m] || 0) + c));
                          const uTopModel = Object.entries(counts).sort((a,b) => b[1] - a[1])[0]?.[0] || 'N/A';

                          return (
                              <Card 
                                key={user.userId} 
                                className="p-6 hover:border-primary/50 cursor-pointer group transition-all hover:shadow-lg hover:shadow-indigo-500/10"
                              >
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
                                          <ChevronDown className="w-5 h-5 text-muted-foreground -rotate-90 group-hover:text-primary transition-colors" />
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-4 mt-6">
                                          <div className="bg-secondary/30 p-3 rounded-lg">
                                              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Usage</p>
                                              <p className="font-bold text-lg">{(uTotal/1000).toFixed(1)}k</p>
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
                              </Card>
                          )
                      })}
                  </div>
              </div>
          )}

          {/* VIEW: CONSOLIDATE / LEADERBOARD */}
          {viewMode === 'consolidate' && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-600 bg-clip-text text-transparent inline-flex items-center gap-3">
                        <Crown className="w-8 h-8 text-amber-400" />
                        Top Performers
                        <Crown className="w-8 h-8 text-amber-400" />
                    </h2>
                    <p className="text-muted-foreground mt-2">Highest token consumption across the team</p>
                  </div>

                  {/* 1. Consolidated Metrics Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12 animate-in fade-in slide-in-from-bottom-2">
                       <Metric 
                           label="Total Input Tokens" 
                           value={(consolidatedStats.input / 1000).toFixed(1) + 'k'} 
                           icon={<Database className="w-5 h-5" />} 
                           color="text-blue-400"
                       />
                       <Metric 
                           label="Total Output Tokens" 
                           value={(consolidatedStats.output / 1000).toFixed(1) + 'k'} 
                           icon={<Database className="w-5 h-5" />} 
                           color="text-green-400"
                       />
                       <Metric 
                           label="Total Tokens Consumed" 
                           value={(consolidatedStats.total / 1000).toFixed(1) + 'k'} 
                           icon={<Zap className="w-5 h-5" />} 
                           color="text-yellow-400"
                       />
                       <Metric 
                           label="Total Queries" 
                           value={consolidatedStats.queries.toLocaleString()} 
                           icon={<Activity className="w-5 h-5" />} 
                           color="text-purple-400"
                       />
                   </div>

                  {/* 3. Consolidated Query Table */}
                  <div className="w-full mt-12 animate-in fade-in slide-in-from-bottom-6">
                      <Card className="p-6">
                        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                            <List className="w-5 h-5 text-indigo-400" />
                            Consolidated Query Classification
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-secondary/30 text-muted-foreground uppercase text-xs font-semibold tracking-wider">
                                    <tr>
                                        <th className="px-4 py-3 rounded-tl-lg">Query Type</th>
                                        <th className="px-4 py-3 text-right">Count</th>
                                        <th className="px-4 py-3 text-right">Share</th>
                                        <th className="px-4 py-3 rounded-tr-lg w-1/3">Distribution</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                    {consolidatedStats.queryDist.map((q, i) => (
                                        <tr key={q.name} className="hover:bg-muted/10 transition-colors">
                                            <td className="px-4 py-3 font-medium flex items-center gap-3">
                                                <div className="p-1.5 rounded-md bg-secondary/50">
                                                    {QueryIcons[q.name] || <Check className="w-3 h-3 text-gray-400" />}
                                                </div>
                                                {q.name}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">{q.value.toLocaleString()}</td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                {((q.value / consolidatedStats.queries) * 100).toFixed(1)}%
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="h-2 w-full bg-secondary/30 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full rounded-full" 
                                                        style={{ 
                                                            width: `${(q.value / consolidatedStats.queries) * 100}%`,
                                                            backgroundColor: COLORS[i % COLORS.length]
                                                        }} 
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                      </Card>
                  </div>

                  {/* 2. Podium (Moved to Bottom) */}
                  <div className="flex flex-col md:flex-row items-end justify-center gap-6 md:gap-8 pb-8 mt-24">
                       {(() => {
                            const sortedUsers = users.map(u => {
                                const total = Object.values(u.tokenQuery).reduce((acc, d) => acc + d.inputTokens + d.outputTokens, 0);
                                return { ...u, total };
                            }).sort((a, b) => b.total - a.total).slice(0, 3);

                            // Reorder for Podium: 2nd, 1st, 3rd
                            const podiumOrder = [];
                            if (sortedUsers[1]) podiumOrder.push({ ...sortedUsers[1], rank: 2 });
                            if (sortedUsers[0]) podiumOrder.push({ ...sortedUsers[0], rank: 1 });
                            if (sortedUsers[2]) podiumOrder.push({ ...sortedUsers[2], rank: 3 });

                            return podiumOrder.map((user) => (
                                <div key={user.userId} className={cn(
                                    "relative flex flex-col items-center p-6 rounded-2xl border transition-all hover:scale-105 duration-300 w-full md:w-64",
                                    user.rank === 1 ? "bg-gradient-to-b from-amber-500/20 to-background border-amber-500/50 shadow-[0_0_30px_-5px_rgba(245,158,11,0.3)] order-2 md:-mt-8 h-96 justify-center" : 
                                    user.rank === 2 ? "bg-gradient-to-b from-slate-300/20 to-background border-slate-300/50 order-1 h-80 justify-center" :
                                    "bg-gradient-to-b from-orange-700/20 to-background border-orange-700/50 order-3 h-80 justify-center"
                                )}>
                                    <div className={cn(
                                        "absolute -top-5 w-10 h-10 flex items-center justify-center rounded-full font-bold border-2 bg-background z-10",
                                        user.rank === 1 ? "border-amber-500 text-amber-500 text-xl" :
                                        user.rank === 2 ? "border-slate-300 text-slate-300 text-lg" :
                                        "border-orange-700 text-orange-700 text-lg"
                                    )}>
                                        #{user.rank}
                                    </div>

                                    <div className="mb-4 relative">
                                        <div className={cn(
                                            "w-20 h-20 rounded-full flex items-center justify-center text-white font-bold text-3xl shadow-lg",
                                            user.rank === 1 ? "bg-gradient-to-tr from-amber-400 to-yellow-600" :
                                            user.rank === 2 ? "bg-gradient-to-tr from-slate-400 to-slate-600" :
                                            "bg-gradient-to-tr from-orange-600 to-amber-900"
                                        )}>
                                            {user.email[0].toUpperCase()}
                                        </div>
                                        {user.rank === 1 && <Crown className="absolute -top-6 -right-2 w-8 h-8 text-yellow-400 drop-shadow-lg rotate-12" />}
                                    </div>

                                    <h3 className="font-bold text-lg text-center truncate w-full px-2" title={user.email}>{user.email.split('@')[0]}</h3>
                                    <p className="text-xs text-muted-foreground mb-4">{user.email}</p>
                                    
                                    <div className="bg-secondary/40 rounded-lg py-2 px-4 text-center w-full mt-auto">
                                        <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Tokens</p>
                                        <p className={cn("text-xl font-bold font-mono", 
                                            user.rank === 1 ? "text-amber-400" : 
                                            user.rank === 2 ? "text-slate-300" : "text-orange-600"
                                        )}>{(user.total / 1000).toFixed(1)}k</p>
                                    </div>
                                    
                                    <button 
                                        onClick={() => selectUser(user.userId)}
                                        className="mt-4 text-xs hover:underline text-muted-foreground hover:text-primary"
                                    >
                                        View Details →
                                    </button>
                                </div>
                            ));
                       })()}
                  </div>
              </div>
          )}

          {/* VIEW: SINGLE DEVELOPER DASHBOARD */}
          {viewMode === 'developer' && currentUser && (
            <>
                {/* 2. High-Level Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in">
                    <Metric 
                        label="Total Tokens" 
                        value={(totalTokens.total / 1000).toFixed(1) + 'k'} 
                        trend="12%" 
                        icon={<Database className="w-5 h-5" />} 
                        color="text-indigo-400"
                    />
                    <Metric 
                        label="Active Sessions" 
                        value={queryDist.reduce((a,b) => a+b.value, 0).toLocaleString()} 
                        icon={<Zap className="w-5 h-5" />} 
                        color="text-yellow-400"
                    />
                    <Metric 
                        label="Most Used Model" 
                        value={mostUsedModel.split(' ')[0]} 
                        icon={<Command className="w-5 h-5" />} 
                        color="text-emerald-400"
                    />
                    <Metric 
                        label="Active Projects" 
                        value={projectStats.length} 
                        icon={<GitBranch className="w-5 h-5" />} 
                        color="text-pink-400"
                    />
                </div>

                {/* 3. Navigation Tabs */}
                <div className="border-b border-border/40">
                    <div className="flex gap-6">
                        {[
                            { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                            { id: 'projects', label: 'Project Breakdown', icon: Folder }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={cn(
                                    "flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-all",
                                    activeTab === tab.id 
                                        ? "border-primary text-primary" 
                                        : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                                )}
                            >
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* 4. Content Area */}
                <div className="min-h-[500px]">

                    {/* VIEW: OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            
                            {/* Main Chart */}
                            <Card className="lg:col-span-2 p-6 flex flex-col">
                                <div className="flex items-center justify-between mb-6">
                                    <div>
                                        <h3 className="font-semibold text-lg">Usage Trends</h3>
                                        <p className="text-sm text-muted-foreground">Daily token consumption by model</p>
                                    </div>
                                    <select 
                                        value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                                        className="bg-secondary/30 border border-border text-xs rounded px-2 py-1 outline-none"
                                    >
                                        <option value="all">Last 30 Days</option>
                                        <option value="7days">Last 7 Days</option>
                                    </select>
                                </div>
                                <div className="h-[350px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="colorTokens" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.4} />
                                            <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                                            <Tooltip 
                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                                                itemStyle={{ color: '#f8fafc' }}
                                            />
                                            {Object.keys(currentUser.usage[Object.keys(currentUser.usage)[0]] || {}).map((key, i) => (
                                                <Area 
                                                    key={key} 
                                                    type="monotone" 
                                                    dataKey={key} 
                                                    stackId="1" 
                                                    stroke={COLORS[i % COLORS.length]} 
                                                    fill={COLORS[i % COLORS.length]} 
                                                    fillOpacity={0.6}
                                                />
                                            ))}
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </Card>

                            {/* Distribution Pie */}
                            <Card className="p-6">
                                <h3 className="font-semibold text-lg mb-1">Query Distribution</h3>
                                <p className="text-sm text-muted-foreground mb-6">Breakdown by task type</p>
                                <div className="h-[250px] relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={queryDist}
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {queryDist.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="transparent" />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }} itemStyle={{ color: '#f8fafc' }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    {/* Center Label */}
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <div className="text-center">
                                            <span className="block text-2xl font-bold">{queryDist.reduce((a,b) => a+b.value, 0)}</span>
                                            <span className="text-xs text-muted-foreground uppercase tracking-wider">Queries</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-4 space-y-3">
                                    {queryDist.slice(0, 4).map((q, i) => (
                                        <div key={q.name} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                                                <span className="text-muted-foreground">{q.name}</span>
                                            </div>
                                            <span className="font-medium text-foreground">{q.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        </div>
                    )}
                    
                    {/* VIEW: PROJECTS */}
                    {activeTab === 'projects' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* 1. Horizontal Bar Chart (Input vs Output per Project) */}
                                <Card className="p-6 h-[500px] flex flex-col">
                                    <h3 className="font-semibold text-lg mb-1">Project Token Usage</h3>
                                    <p className="text-sm text-muted-foreground mb-6">Input vs Output tokens per project</p>
                                    <div className="flex-1 w-full min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart 
                                                data={projectStats} 
                                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.4} />
                                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                                                <Tooltip 
                                                    cursor={{fill: '#334155', opacity: 0.2}}
                                                    contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                                                />
                                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                                <Bar dataKey="input" fill="#6366f1" name="Input Tokens" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="output" fill="#10b981" name="Output Tokens" radius={[4, 4, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
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
                                                    const totalProjectQueries = Object.values(proj.queries).reduce((a: any, b: any) => a + b, 0);
                                                    return (
                                                        <>
                                                            {/* Project Header Row */}
                                                            <tr key={proj.name} className="bg-secondary/10">
                                                                <td colSpan={3} className="px-4 py-2 text-xs font-bold text-muted-foreground bg-muted/20 uppercase tracking-wider flex items-center gap-2">
                                                                    <GitBranch className="w-3 h-3" />
                                                                    {proj.name}
                                                                    <span className="ml-auto font-normal opacity-70">Total: {totalProjectQueries}</span>
                                                                </td>
                                                            </tr>
                                                            {/* Query Type Rows */}
                                                            {/* @ts-ignore */}
                                                            {Object.entries(proj.queries).sort((a: any, b: any) => b[1] - a[1]).map(([qName, qCount]: [string, any]) => (
                                                                <tr key={`${proj.name}-${qName}`} className="hover:bg-muted/10 transition-colors">
                                                                    <td className="px-4 py-3 font-medium flex items-center gap-2 pl-8">
                                                                        {QueryIcons[qName] || <Check className="w-4 h-4 text-gray-400" />}
                                                                        {qName}
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right font-mono">{qCount.toLocaleString()}</td>
                                                                    <td className="px-4 py-3 text-right">
                                                                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-secondary text-foreground">
                                                                            {/* @ts-ignore */}
                                                                            {((qCount / totalProjectQueries) * 100).toFixed(1)}%
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </Card>
                            </div>
                        </div>
                    )}
                </div>
            </>
          )}

      </main>
    </div>
  );
}
