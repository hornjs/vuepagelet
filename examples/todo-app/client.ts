import { createRouteRuntimeIntegration } from "vuepagelet/integration";
import { app, routes } from "./routes.ts";

createRouteRuntimeIntegration({
  routes,
  app,
})
  .hydrate()
  .mount();
