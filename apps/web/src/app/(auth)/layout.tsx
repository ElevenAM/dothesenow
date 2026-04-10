import { AppLogo } from "@/components/ui/app-logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Left panel — branded, desktop only */}
      <div className="hidden md:flex md:w-1/2 lg:w-[45%] flex-col justify-between bg-primary p-8 lg:p-12 text-primary-foreground">
        <AppLogo className="text-primary-foreground" />

        <div className="space-y-4">
          <h1 className="text-3xl lg:text-4xl font-medium leading-tight">
            Delegate, track, and
            <br />
            complete — together.
          </h1>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li className="flex items-center gap-2">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /></svg>
              Assign tasks to anyone with just an email
            </li>
            <li className="flex items-center gap-2">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /></svg>
              Automated reminders keep things moving
            </li>
            <li className="flex items-center gap-2">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /></svg>
              AI-powered prioritization and summaries
            </li>
          </ul>
        </div>

        <p className="text-xs text-primary-foreground/50">
          &copy; {new Date().getFullYear()} DoTheseNow
        </p>
      </div>

      {/* Right panel — form area */}
      <div className="flex flex-1 flex-col bg-background">
        {/* Mobile header */}
        <div className="flex items-center px-4 pt-6 md:hidden">
          <AppLogo className="text-foreground" />
        </div>

        {/* Centered form container */}
        <div className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-[400px]">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
