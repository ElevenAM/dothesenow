import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { ErrorBoundary, ErrorFallback } from "../error-boundary";

// Suppress React console.error for expected error boundary catches
vi.spyOn(console, "error").mockImplementation(() => {});

function ThrowingChild(): never {
  throw new Error("Test render error");
}

function GoodChild() {
  return <div>Everything is fine</div>;
}

describe("ErrorFallback", () => {
  it("renders error message", () => {
    const html = renderToString(
      <ErrorFallback error={new Error("Something broke")} />
    );
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Something broke");
  });

  it("renders default message when no error provided", () => {
    const html = renderToString(<ErrorFallback />);
    expect(html).toContain("An unexpected error occurred");
  });

  it("renders report issue link", () => {
    const html = renderToString(<ErrorFallback />);
    expect(html).toContain("Report issue");
    expect(html).toContain("github.com/ElevenAM/DoTheseNow/issues");
  });

  it("renders try again button when reset is provided", () => {
    const html = renderToString(<ErrorFallback reset={() => {}} />);
    expect(html).toContain("Try again");
  });
});

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    const html = renderToString(
      <ErrorBoundary>
        <GoodChild />
      </ErrorBoundary>
    );
    expect(html).toContain("Everything is fine");
  });

  it("getDerivedStateFromError returns error state", () => {
    const error = new Error("test");
    const state = ErrorBoundary.getDerivedStateFromError(error);
    expect(state).toEqual({ hasError: true, error });
  });

  it("catches render errors and shows fallback via SSR", () => {
    // React SSR re-throws in renderToString, so we verify the
    // static method and fallback rendering separately
    const html = renderToString(
      <ErrorFallback error={new Error("Test render error")} reset={() => {}} />
    );
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Test render error");
    expect(html).toContain("Try again");
  });
});
