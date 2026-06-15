import dotenv from "dotenv";
import { exploreDemoWorkflows } from "../lib/demoWorkflowExplorer.js";

dotenv.config();

const question = process.argv.slice(2).join(" ").trim() || "Explore demo booking workflows";

exploreDemoWorkflows({ question })
  .then(({ outputPath, entry }) => {
    console.log(`Wrote demo workflow exploration to ${outputPath}`);
    console.log(`Captured ${entry.routes?.length || 0} route(s). Review and rebuild the knowledge index before chatbot use.`);
  })
  .catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
