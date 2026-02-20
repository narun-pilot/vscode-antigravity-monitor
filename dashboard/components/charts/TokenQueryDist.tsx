
"use client"

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface TokenQueryDistProps {
  data: { [queryType: string]: number };
}

export function TokenQueryDist({ data }: TokenQueryDistProps) {
  // Convert { "Coding": 10, "Debug": 5 } to [{ name: "Coding", value: 10 }]
  const chartData = Object.entries(data).map(([name, value]) => ({ name, value }));

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF194F'];

  return (
    <Card className="w-full bg-white/5 backdrop-blur-lg border-white/10 text-white shadow-xl">
      <CardHeader>
        <CardTitle className="text-xl font-bold bg-gradient-to-r from-green-400 to-teal-400 bg-clip-text text-transparent">
          Query Type Distribution
        </CardTitle>
        <CardDescription className="text-gray-400">
          Breakdown of query types (Total)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full flex justify-center items-center">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={5}
                dataKey="value"
                label={true}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
              />
              <Legend verticalAlign="bottom" height={36}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
