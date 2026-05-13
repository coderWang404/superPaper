import AuthenticationController from "../Authentication/AuthenticationController.mjs";
import TemplatesController from "./TemplatesController.mjs";
import TemplatesMiddleware from "./TemplatesMiddleware.mjs";
import { RateLimiter } from "../../infrastructure/RateLimiter.mjs";
import RateLimiterMiddleware from "../Security/RateLimiterMiddleware.mjs";

const rateLimiter = new RateLimiter("create-project-from-template", {
  points: 20,
  duration: 60,
});

export default {
  rateLimiter,
  apply(app) {
    app.get(
      "/project/new/template/:Template_version_id",
      TemplatesMiddleware.saveTemplateDataInSession,
      AuthenticationController.requireLogin(),
      TemplatesController.getV1Template,
    );

    app.post(
      "/project/new/template",
      AuthenticationController.requireLogin(),
      RateLimiterMiddleware.rateLimit(rateLimiter),
      TemplatesController.createProjectFromV1Template,
    );
  },
};
