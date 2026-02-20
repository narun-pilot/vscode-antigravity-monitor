"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectUsage = ProjectUsage;
const recharts_1 = require("recharts");
const card_1 = require("@/components/ui/card");
function ProjectUsage({ data }) {
    // Convert { "branchA": { inputTokens, outputTokens } } to [{ name: "branchA", input: x, output: y }]
    const chartData = Object.entries(data).map(([branch, stats]) => ({
        name: branch,
        input: stats.inputTokens,
        output: stats.outputTokens
    }));
    return (<card_1.Card className="w-full bg-white/5 backdrop-blur-lg border-white/10 text-white shadow-xl">
      <card_1.CardHeader>
        <card_1.CardTitle className="text-xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
          Project Breakdown
        </card_1.CardTitle>
        <card_1.CardDescription className="text-gray-400">
          Token usage by branch/project
        </card_1.CardDescription>
      </card_1.CardHeader>
      <card_1.CardContent>
        <div className="h-[350px] w-full">
          <recharts_1.ResponsiveContainer width="100%" height="100%">
            <recharts_1.BarChart layout="vertical" data={chartData} margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
              <recharts_1.CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)"/>
              <recharts_1.XAxis type="number" stroke="#ccc" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}/>
              <recharts_1.YAxis dataKey="name" type="category" stroke="#ccc" fontSize={12} tickLine={false} axisLine={false} width={100}/>
              <recharts_1.Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} itemStyle={{ color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }}/>
              <recharts_1.Legend verticalAlign="top" height={36}/>
              <recharts_1.Bar dataKey="input" fill="#8884d8" stackId="a" name="Input Tokens" radius={[0, 0, 0, 0]}/>
              <recharts_1.Bar dataKey="output" fill="#82ca9d" stackId="a" name="Output Tokens" radius={[0, 4, 4, 0]}/>
            </recharts_1.BarChart>
          </recharts_1.ResponsiveContainer>
        </div>
      </card_1.CardContent>
    </card_1.Card>);
}
//# sourceMappingURL=ProjectUsage.js.map