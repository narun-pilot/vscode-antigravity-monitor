
"use client"

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProjectStats } from "@/app/lib/types";

interface ProjectUsageProps {
  data: ProjectStats;
}

export function ProjectUsage({ data }: ProjectUsageProps) {
  // Convert { "branchA": { inputTokens, outputTokens } } to [{ name: "branchA", input: x, output: y }]
  const chartData = Object.entries(data).map(([branch, stats]) => ({
    name: branch,
    input: stats.inputTokens,
    output: stats.outputTokens
  }));

  return (
    <Card className="w-full bg-white/5 backdrop-blur-lg border-white/10 text-white shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold bg-gradient-to-r from-pink-400 to-rose-400 bg-clip-text text-transparent">
          Project Breakdown
        </CardTitle>
        <CardDescription className="text-gray-400">
          Token usage by branch/project
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart 
              layout="vertical" 
              data={chartData}
              margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(255,255,255,0.1)" />
              <XAxis type="number" stroke="#ccc" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`} />
              <YAxis dataKey="name" type="category" stroke="#ccc" fontSize={12} tickLine={false} axisLine={false} width={100} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Legend verticalAlign="top" height={36}/>
              <Bar dataKey="input" fill="#8884d8" stackId="a" name="Input Tokens" radius={[0, 0, 0, 0]} />
              <Bar dataKey="output" fill="#82ca9d" stackId="a" name="Output Tokens" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
