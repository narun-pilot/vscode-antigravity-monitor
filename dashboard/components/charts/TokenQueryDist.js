"use strict";
"use client";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenQueryDist = TokenQueryDist;
const recharts_1 = require("recharts");
const card_1 = require("@/components/ui/card");
function TokenQueryDist({ data }) {
    // Convert { "Coding": 10, "Debug": 5 } to [{ name: "Coding", value: 10 }]
    const chartData = Object.entries(data).map(([name, value]) => ({ name, value }));
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#AF19FF', '#FF194F'];
    return (<card_1.Card className="w-full bg-white/5 backdrop-blur-lg border-white/10 text-white shadow-xl">
      <card_1.CardHeader>
        <card_1.CardTitle className="text-xl font-bold bg-gradient-to-r from-green-400 to-teal-400 bg-clip-text text-transparent">
          Query Type Distribution
        </card_1.CardTitle>
        <card_1.CardDescription className="text-gray-400">
          Breakdown of query types (Total)
        </card_1.CardDescription>
      </card_1.CardHeader>
      <card_1.CardContent>
        <div className="h-[300px] w-full flex justify-center items-center">
          <recharts_1.ResponsiveContainer width="100%" height="100%">
            <recharts_1.PieChart>
              <recharts_1.Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} fill="#8884d8" paddingAngle={5} dataKey="value" label={true}>
                {chartData.map((entry, index) => (<recharts_1.Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]}/>))}
              </recharts_1.Pie>
              <recharts_1.Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} itemStyle={{ color: '#fff' }}/>
              <recharts_1.Legend verticalAlign="bottom" height={36}/>
            </recharts_1.PieChart>
          </recharts_1.ResponsiveContainer>
        </div>
      </card_1.CardContent>
    </card_1.Card>);
}
//# sourceMappingURL=TokenQueryDist.js.map