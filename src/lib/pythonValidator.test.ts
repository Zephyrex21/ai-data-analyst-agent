import { describe, it, expect } from "vitest";
import { validatePythonCode } from "./pythonValidator";

describe("validatePythonCode — legitimate code passes", () => {
  it("allows a correlation computed on df", () => {
    expect(validatePythonCode("result = df['units_sold'].corr(df['revenue'])").valid).toBe(true);
  });

  it("allows a z-score outlier filter", () => {
    const code =
      "result = df[(df['revenue'] - df['revenue'].mean()).abs() > 2 * df['revenue'].std()]";
    expect(validatePythonCode(code).valid).toBe(true);
  });

  it("allows a groupby producing a DataFrame result", () => {
    const code = "grouped = df.groupby('region')['revenue'].sum()\nresult = grouped";
    expect(validatePythonCode(code).valid).toBe(true);
  });
});

describe("validatePythonCode — risky patterns are blocked", () => {
  it("blocks import os", () => {
    expect(validatePythonCode("import os\nresult = os.listdir('/')").valid).toBe(false);
  });

  it("blocks open()", () => {
    expect(validatePythonCode("f = open('/etc/passwd')\nresult = f.read()").valid).toBe(false);
  });

  it("blocks eval()", () => {
    expect(validatePythonCode("result = eval('1+1')").valid).toBe(false);
  });

  it("blocks network access via requests", () => {
    const code = "import requests\nresult = requests.get('http://evil.com').text";
    expect(validatePythonCode(code).valid).toBe(false);
  });
});

describe("validatePythonCode — contract enforcement", () => {
  it("rejects code that reloads df instead of using the existing one", () => {
    const code = "df = pd.read_csv('other.csv')\nresult = df.shape[0]";
    expect(validatePythonCode(code).valid).toBe(false);
  });

  it("rejects code that never assigns to `result`", () => {
    expect(validatePythonCode("x = df['revenue'].mean()").valid).toBe(false);
  });

  it("rejects empty code", () => {
    expect(validatePythonCode("   ").valid).toBe(false);
  });
});
