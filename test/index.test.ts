// Mock external dependencies
jest.mock("express", () => jest.fn(() => ({
  use: jest.fn(),
  get: jest.fn(),
  listen: jest.fn(),
})));
jest.mock("compression", () => jest.fn(() => jest.fn()));
jest.mock("dotenv", () => ({ config: jest.fn() }));
jest.mock("pino", () => jest.fn(() => ({ info: jest.fn() })));
jest.mock("../src/routes/ais", () => ({
  router: {},
}));
jest.mock("../src/routes/nsjson", () => ({
  router: {},
}));
jest.mock("../src/routes/s2", () => ({
  s2Router: {},
}));
import _express from "express";
import _compression from "compression";
import _dotenv from "dotenv";
import _pino from "pino";
import { router as _aisRouter } from "../src/routes/ais";
import { router as _nsjsonRouter } from "../src/routes/nsjson";
import { s2Router as _s2Router } from "../src/routes/s2";

describe("App", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("should handle healthz endpoint", () => {
    const { app } = require("../src/index");
    const calls = (app.get as jest.MockedFunction<typeof app.get>).mock.calls;
    const healthzCall = calls.find((call) => call[0] === '/healthz');
    const handler = healthzCall?.[1];
    const mockReq = {};
    const mockRes = { json: jest.fn() };
    if (handler) handler(mockReq, mockRes);
    expect(mockRes.json).toHaveBeenCalledWith({ ok: true });
  });

  it("should set up middleware and routes", () => {
    const app = require("../src/index").app;

    expect((app as unknown as { use: jest.MockedFunction<any> }).use).toHaveBeenCalledTimes(3);
  });

  it("should listen on port when not in test", () => {
    delete process.env.JEST_WORKER_ID;
    const app = require("../src/index").app;
    expect((app as unknown as { listen: jest.MockedFunction<any> }).listen).toHaveBeenCalled();
  });
});
