import jwt from "jsonwebtoken";
import { config } from "./config.js";

export interface CampaignRoleClaim {
  campaign_id: string;
  role: string;
}

// JWT payload shape is part of docs/API_CONTRACT.md and is intentionally snake_case
// (`{ sub, org_id, campaign_roles: [{campaign_id, role}] }`) even though HTTP JSON bodies
// elsewhere in this API are camelCase - the console and mobile apps decode this token
// directly, so the field names here must match the contract exactly.
export interface AccessTokenPayload {
  sub: string;
  org_id: string;
  campaign_roles: CampaignRoleClaim[];
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  org_id: string;
  type: "refresh";
}

export function signAccessToken(sub: string, orgId: string, campaignRoles: CampaignRoleClaim[]): string {
  const payload: AccessTokenPayload = { sub, org_id: orgId, campaign_roles: campaignRoles, type: "access" };
  const options: jwt.SignOptions = { expiresIn: config.jwtAccessTtl as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, config.jwtAccessSecret, options);
}

export function signRefreshToken(sub: string, orgId: string): string {
  const payload: RefreshTokenPayload = { sub, org_id: orgId, type: "refresh" };
  const options: jwt.SignOptions = { expiresIn: config.jwtRefreshTtl as jwt.SignOptions["expiresIn"] };
  return jwt.sign(payload, config.jwtRefreshSecret, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, config.jwtAccessSecret) as AccessTokenPayload;
  if (decoded.type !== "access") throw new Error("not an access token");
  return decoded;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, config.jwtRefreshSecret) as RefreshTokenPayload;
  if (decoded.type !== "refresh") throw new Error("not a refresh token");
  return decoded;
}
