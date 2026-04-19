import { Link } from "@tanstack/react-router";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps {
  to: string;
  className?: string;
  activeClassName?: string;
  pendingClassName?: string;
  children?: React.ReactNode;
}

const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, to, children }, ref) => {
    return (
      <Link
        ref={ref}
        to={to as string}
        className={cn(className)}
        activeProps={{ className: activeClassName }}
      >
        {children}
      </Link>
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
