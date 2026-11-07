import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

window.scrollTo = vi.fn();

afterEach(() => {
  cleanup();
  localStorage.clear();
  // Reset test URLs without queuing a hashchange into the next mounted App.
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
  delete window.ethereum;
});
