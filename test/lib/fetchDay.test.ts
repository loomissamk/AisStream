// Mock external dependencies
jest.mock("got", () => ({
  stream: jest.fn(),
}));
jest.mock("unzipper", () => ({
  ParseOne: jest.fn(),
}));
jest.mock("csv-parse", () => ({
  parse: jest.fn(),
}));
jest.mock("pino", () => ({
  __esModule: true,
  default: jest.fn(() => ({
    info: jest.fn(),
  })),
}));

// Import after mocks
import got from "got";
import unzipper from "unzipper";
import { parse } from "csv-parse";
import pino from "pino";
import { streamDay } from "../../src/lib/fetchDay";

const mockGotStream = got.stream as jest.MockedFunction<typeof got.stream>;
const mockParseOne = unzipper.ParseOne as jest.MockedFunction<typeof unzipper.ParseOne>;
const mockParse = parse as jest.MockedFunction<typeof parse>;
const _mockPino = pino as jest.MockedFunction<typeof pino>;

describe("streamDay", () => {
  let mockHttpStream: any;
  let mockUnzipStream: any;
  let mockCsvStream: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHttpStream = {
      pipe: jest.fn().mockReturnThis(),
      on: jest.fn(),
    };
    mockUnzipStream = {
      pipe: jest.fn().mockReturnThis(),
      on: jest.fn(),
    };
    mockCsvStream = {
      pipe: jest.fn().mockReturnThis(),
      on: jest.fn(),
      read: jest.fn(),
    };

    mockGotStream.mockReturnValue(mockHttpStream);
    mockParseOne.mockReturnValue(mockUnzipStream);
    mockParse.mockReturnValue(mockCsvStream);
    // pino is mocked above
  });

  it("should throw error for invalid day format", async () => {
    await expect(streamDay("invalid", jest.fn())).rejects.toThrow("Invalid day: invalid");
  });

  it("should stream data successfully", async () => {
    const onRow = jest.fn();
    const testRow = { LON: "1", LAT: "2", prop: "value" };

    // Mock the streams to emit data
    mockCsvStream.on.mockImplementation((event, cb) => {
      if (event === "readable") {
        mockCsvStream.read.mockReturnValueOnce(testRow).mockReturnValueOnce(null);
        cb();
      } else if (event === "end") {
        cb();
      }
    });

    await streamDay("2023-01-01", onRow);

    expect(mockGotStream).toHaveBeenCalledWith(
      "https://coast.noaa.gov/htdata/CMSP/AISDataHandler/2023/AIS_2023_01_01.zip",
      expect.objectContaining({
        timeout: { request: 30_000 },
        retry: { limit: 2 },
        throwHttpErrors: true,
      })
    );
    expect(onRow).toHaveBeenCalledWith(testRow);
  });

  it("should handle HTTP error", async () => {
    const onRow = jest.fn();
    const error = new Error("HTTP error");

    mockHttpStream.on.mockImplementation((event, cb) => {
      if (event === "error") cb(error);
    });

    await expect(streamDay("2023-01-01", onRow)).rejects.toThrow("HTTP: HTTP error");
  });

  it("should handle unzip error", async () => {
    const onRow = jest.fn();
    const error = new Error("Unzip error");

    mockUnzipStream.on.mockImplementation((event, cb) => {
      if (event === "error") cb(error);
    });

    await expect(streamDay("2023-01-01", onRow)).rejects.toThrow("Unzip error: Unzip error");
  });

  it("should handle CSV error", async () => {
    const onRow = jest.fn();
    const error = new Error("CSV error");

    mockCsvStream.on.mockImplementation((event, cb) => {
      if (event === "error") cb(error);
    });

    await expect(streamDay("2023-01-01", onRow)).rejects.toThrow("CSV error: CSV error");
  });

  it("should handle onRow callback error", async () => {
    const onRow = jest.fn().mockImplementation(() => {
      throw new Error("Callback error");
    });
    const testRow = { LON: "1", LAT: "2" };

    mockCsvStream.on.mockImplementation((event, cb) => {
      if (event === "readable") {
        mockCsvStream.read.mockReturnValueOnce(testRow).mockReturnValueOnce(null);
        cb();
      }
    });

    await expect(streamDay("2023-01-01", onRow)).rejects.toThrow("Error in row callback: Callback error");
  });

  it("should handle non-Error rejection in fail function", async () => {
    const onRow = jest.fn();
    const error = "string error"; // non-Error

    // Mock the try-catch in streamDay to trigger fail with non-Error
    mockGotStream.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw error;
    });

    await expect(streamDay("2023-01-01", onRow)).rejects.toThrow("Unknown error: string error");
  });
});
