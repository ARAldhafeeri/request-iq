import { Authentication } from "../src/auth";
import { RequestIQConfig } from "../src/types";
import { createMockConfig } from "./utils";

describe("Authentication", () => {
  describe("isValidAuth", () => {
    it("should return true when auth is not configured", () => {
      const config: RequestIQConfig = createMockConfig({});
      const auth = new Authentication(config);
      expect(auth.isValidAuth("Basic anytoken")).toBe(true);
    });

    it("should return false when auth header is missing", () => {
      const config: RequestIQConfig = createMockConfig({
        dashboard: {
          enabled: true,
          path: "/hello",
          enableAuth: false,
          auth: {
            username: "admin",
            password: "secret",
          },
        },
      });
      const auth = new Authentication(config);
      expect(auth.isValidAuth("")).toBe(false);
    });

    it("should return false when auth header is malformed", () => {
      const config: RequestIQConfig = createMockConfig({
        dashboard: {
          enabled: true,
          path: "hello",
          enableAuth: true,

          auth: {
            username: "admin",
            password: "secret",
          },
        },
      });
      const auth = new Authentication(config);
      expect(auth.isValidAuth("Basic")).toBe(false); // Missing token
      expect(auth.isValidAuth("Bearer token")).toBe(false); // Wrong auth type
    });

    it("should return false when credentials are invalid", () => {
      const config: RequestIQConfig = createMockConfig({
        dashboard: {
          enabled: true,
          path: "hello",
          enableAuth: true,

          auth: {
            username: "admin",
            password: "secret",
          },
        },
      });
      const auth = new Authentication(config);
      // Wrong username
      expect(
        auth.isValidAuth(
          "Basic " + Buffer.from("wrong:secret").toString("base64")
        )
      ).toBe(false);
      // Wrong password
      expect(
        auth.isValidAuth(
          "Basic " + Buffer.from("admin:wrong").toString("base64")
        )
      ).toBe(false);
      // Both wrong
      expect(
        auth.isValidAuth(
          "Basic " + Buffer.from("wrong:wrong").toString("base64")
        )
      ).toBe(false);
    });

    it("should return true when credentials are valid", () => {
      const config: RequestIQConfig = createMockConfig({
        dashboard: {
          enabled: true,
          path: "hello",
          enableAuth: true,

          auth: {
            username: "admin",
            password: "secret",
          },
        },
      });
      const auth = new Authentication(config);
      const validToken =
        "Basic " + Buffer.from("admin:secret").toString("base64");
      expect(auth.isValidAuth(validToken)).toBe(true);
    });
  });
});
