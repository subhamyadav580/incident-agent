import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "./cn";

// react-markdown escapes raw HTML by default, so log text in reports can't inject markup.
export const Markdown = ({ children, className }: { children: string; className?: string }) => (
  <div className={cn("prose-report", className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
  </div>
);
