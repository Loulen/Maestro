import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import SidePicker from "./SidePicker";

describe("SidePicker", () => {
  it("renders all four sides", () => {
    render(<SidePicker value="left" onChange={() => {}} />);
    expect(screen.getByTitle("left")).toBeInTheDocument();
    expect(screen.getByTitle("right")).toBeInTheDocument();
    expect(screen.getByTitle("top")).toBeInTheDocument();
    expect(screen.getByTitle("bottom")).toBeInTheDocument();
  });

  it("highlights the active side", () => {
    render(<SidePicker value="right" onChange={() => {}} />);
    const rightBtn = screen.getByTitle("right");
    expect(rightBtn.className).toContain("bg-acc-bg");
    const leftBtn = screen.getByTitle("left");
    expect(leftBtn.className).not.toContain("bg-acc-bg");
  });

  it("calls onChange with the clicked side", () => {
    const onChange = vi.fn();
    render(<SidePicker value="left" onChange={onChange} />);
    fireEvent.click(screen.getByTitle("bottom"));
    expect(onChange).toHaveBeenCalledWith("bottom");
  });

  it("displays abbreviated labels", () => {
    render(<SidePicker value="left" onChange={() => {}} />);
    expect(screen.getByTitle("left")).toHaveTextContent("L");
    expect(screen.getByTitle("right")).toHaveTextContent("R");
    expect(screen.getByTitle("top")).toHaveTextContent("T");
    expect(screen.getByTitle("bottom")).toHaveTextContent("B");
  });
});
