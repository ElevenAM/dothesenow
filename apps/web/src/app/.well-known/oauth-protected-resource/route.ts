import {
  protectedResourceHandler,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";
import { getAppUrl } from "@/lib/mcp-oauth/config";

const handler = protectedResourceHandler({
  authServerUrls: [getAppUrl()],
});

const corsHandler = metadataCorsOptionsRequestHandler();

export { handler as GET, corsHandler as OPTIONS };
