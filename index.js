import { createFederation } from "@fedify/fedify";
import express from "express";

const federation = createFederation({});

federation.setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
  if (identifier !== "me") return null;
  return {
    id: new URL("/users/me", ctx.url),
    name: "XClone User",
    preferredUsername: "me",
    inbox: new URL("/users/me/inbox", ctx.url),
  };
});

const app = express();
app.use(federation);
app.listen(3000, () => console.log("XClone running on http://localhost:3000"));
