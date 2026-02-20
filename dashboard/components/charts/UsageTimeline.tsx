
"use client"

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface UsageTimelineProps {
  data: any[];
}

export function UsageTimeline({ data }: UsageTimelineProps) {
  // Data format: { date: "YYYY-MM-DD", "Gemini": 120, "Claude": 80 }
  
  // Extract all unique model keys for dynamic bars
  const modelKeys = Array.from(new Set(data.flatMap(d => Object.keys(d).filter(k => k !== 'date'))));
  
  const colors = [
    "#8884d8", "#82ca9d", "#ffc658", "#ff8042", "#a4de6c", "#d0ed57"
  ];

  return (
    <Card className="w-full bg-white/5 backdrop-blur-lg border-white/10 text-white shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          AI Token Usage Over Time
        </CardTitle>
        <CardDescription className="text-gray-400">
          Daily token consumption by model
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis 
                dataKey="date" 
                stroke="#ccc" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
              />
              <YAxis 
                stroke="#ccc" 
                fontSize={12} 
                tickLine={false} 
                axisLine={false}
                tickFormatter={(value) => `${(value / 1000).toFixed(1)}k`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              {modelKeys.map((key, index) => (
                <Bar 
                  key={key} 
                  dataKey={key} 
                  stackId="a" 
                  fill={colors[index % colors.length]} 
                  radius={index === modelKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  animationDuration={1500}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
