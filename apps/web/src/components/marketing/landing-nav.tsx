"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { AppLogo } from "@/components/ui/app-logo";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "How It Works", href: "#the-loop" },
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
] as const;

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 inset-x-0 z-50 transition-colors",
        scrolled
          ? "bg-background/95 backdrop-blur border-b border-border"
          : "bg-transparent"
      )}
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between h-14 px-4 md:px-6">
        <Link href="/" aria-label="DoTheseNow home">
          <AppLogo
            className={cn(
              "transition-colors",
              scrolled ? "text-foreground" : "text-white"
            )}
          />
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:opacity-80",
                scrolled ? "text-foreground" : "text-white/80 hover:text-white"
              )}
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/login"
            className={cn(
              "text-sm font-medium transition-colors",
              scrolled
                ? "text-muted-foreground hover:text-foreground"
                : "text-white/70 hover:text-white"
            )}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className={buttonVariants({ size: "sm" })}
          >
            Start free
          </Link>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden">
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className={scrolled ? "text-foreground" : "text-white"}
                  aria-label="Open menu"
                />
              }
            >
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent side="right" className="w-64">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <nav className="flex flex-col gap-4 p-4 pt-8">
                {NAV_LINKS.map((link) => (
                  <SheetClose key={link.href} render={<a href={link.href} />}>
                    <span className="text-sm font-medium text-foreground">
                      {link.label}
                    </span>
                  </SheetClose>
                ))}
                <hr className="border-border" />
                <SheetClose render={<Link href="/login" />}>
                  <span className="text-sm font-medium text-muted-foreground">
                    Log in
                  </span>
                </SheetClose>
                <SheetClose render={<Link href="/signup" />}>
                  <span className={buttonVariants({ size: "sm", className: "w-full" })}>
                    Start free
                  </span>
                </SheetClose>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
