"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = Home;
const Dashboard_1 = require("@/components/Dashboard");
const sample_json_1 = require("@/app/data/sample.json");
function Home() {
    return (<main>
      <Dashboard_1.default initialData={sample_json_1.default}/>
    </main>);
}
//# sourceMappingURL=page.js.map