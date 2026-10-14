import { describe, expect, it } from "vitest";
import { translateDemoText } from "./demo-locale";

describe("Demo English translations", () => {
  it("translates dynamic team and chart labels without mixed Chinese", () => {
    expect(translateDemoText("中文")).toBe("中文");
    expect(translateDemoText("顶级")).toBe("Elite");
    expect(translateDemoText("低分")).toBe("Low");
    expect(translateDemoText("Team 1036 自动和手动贡献拆分")).toBe("Team 1036 AUTO and TELEOP contribution breakdown");
    expect(translateDemoText("忽略 Team 1036 M23")).toBe("Ignore Team 1036 M23");
    expect(translateDemoText("FRC比赛数据查看")).toBe("FRC match data viewer");
  });
});
