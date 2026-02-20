"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageTimeline = UsageTimeline;
const recharts_1 = require("recharts");
const card_1 = require("@/components/ui/card");
function UsageTimeline({ data }) {
    // Data format: { date: "YYYY-MM-DD", "Gemini": 120, "Claude": 80 }
    // Extract all unique model keys for dynamic bars
    const modelKeys = Array.from(new Set(data.flatMap(d => Object.keys(d).filter(k => k !== 'date'))));
    const colors = [
        "#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#a4de6c", "#d0ed57"
    ];
    return (<card_1.Card className="w-full bg-white/5 backdrop-blur-lg border-white/10 text-white shadow-xl">
      <card_1.CardHeader>
        <card_1.CardTitle className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          AI Token Usage Over Time
        </card_1.CardTitle>
        <card_1.CardDescription className="text-gray-400">
          Daily token consumption by model
        </card_1.CardDescription>
      </card_1.CardHeader>
      <card_1.CardContent>
        <div className="h-[350px] w-full">
          <recharts_1.ResponsiveContainer width="100%" height="100%">
            <recharts_1.BarChart data={data}>
              <recharts_1.CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)"/>
              <recharts_1.XAxis dataKey="date" stroke="#ccc" fontSize={12} tickLine={false} axisLine={false}/>
              <recharts_1.YAxis stroke="#ccc" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${(value / 1000).toFixed(1)}k`}/>
              <recharts_1.Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} itemStyle={{ color: '#fff' }} cursor={{ fill: 'rgba(255,255,255,0.05)' }}/>
              <recharts_1.Legend wrapperStyle={{ paddingTop: '20px' }}/>
              {modelKeys.map((key, index) => (<recharts_1.Bar key={key} dataKey={key} stackId="a" fill={colors[index % colors.length]} radius={index === modelKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} animationDuration={1500}/>))}
            </recharts_1.BarChart>
          </recharts_1.ResponsiveContainer>
        </div>
      </card_1.CardContent>
    </card_1.Card>);
}
//# sourceMappingURL=UsageTimeline.js.map