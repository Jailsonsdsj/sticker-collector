import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

export interface MarkdownProps {
  children: string;
  className?: string;
}

/**
 * Author-written prose, with its formatting kept.
 *
 * **Markdown, not a WYSIWYG editor.** The thing being edited is a `<textarea>`
 * the author can drag taller, so the stored value has to stay a plain string —
 * which markdown is, and which a rich-text editor's HTML or JSON is not. That
 * keeps three things true that are worth more than a toolbar: a description
 * written before this existed renders exactly as it did, the backup file's
 * shape does not change, and the Worker never parses a document (it has 10ms).
 *
 * **No `dangerouslySetInnerHTML` anywhere in this path.** `react-markdown`
 * builds React elements directly, and ignores raw HTML in the source unless
 * `rehype-raw` is added — which it is not, and should not be. A description
 * containing `<script>` is text about a script. That property is the reason to
 * take the dependency rather than pipe `marked` into an HTML sink, and it is
 * the one thing to check if anyone ever swaps the library out.
 *
 * Every element is mapped to the design system's own type and colour. Left to
 * itself the renderer emits bare tags, and the browser's default `<h1>` in the
 * middle of a task sheet is the only thing on the screen not drawn by this app.
 */
const COMPONENTS: Components = {
  // Paragraphs carry the spacing, so a single-paragraph description looks
  // exactly like the plain text it used to be.
  p: ({ children }) => <p className="mt-2 first:mt-0">{children}</p>,

  strong: ({ children }) => <strong className="font-bold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => <del className="text-ink-faint line-through">{children}</del>,

  // One step down from the sheet's own title, which is the task's name — a
  // heading inside the notes is never the most important thing on the screen.
  h1: ({ children }) => (
    <h3 className="mt-3 font-display text-lg tracking-display text-ink uppercase italic first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h4 className="mt-3 font-body text-md font-bold text-ink first:mt-0">{children}</h4>
  ),
  h3: ({ children }) => (
    <h5 className="mt-3 font-body text-sm font-bold text-ink first:mt-0">{children}</h5>
  ),

  ul: ({ children }) => <ul className="mt-2 list-disc pl-5 first:mt-0">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal pl-5 first:mt-0">{children}</ol>,
  li: ({ children }) => <li className="mt-1">{children}</li>,

  // GFM checkboxes. Read-only on purpose: ticking one here would have to write
  // back into the description, and the box that completes a task is the one on
  // the task, not one inside its notes.
  input: ({ checked, type }) =>
    type === "checkbox" ? (
      <input type="checkbox" checked={checked} readOnly className="mr-2 align-middle" />
    ) : null,

  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      // `noopener` is the one that matters — a new tab keeping a handle on this
      // one can navigate it away.
      rel="noreferrer noopener"
      className="text-cyan underline"
    >
      {children}
    </a>
  ),

  code: ({ children }) => (
    <code className="rounded bg-surface-2 px-1 py-0.5 font-numeric text-sm text-ink">
      {children}
    </code>
  ),
  // Scrolls inside itself: a long line of code must not make the sheet scroll
  // sideways.
  pre: ({ children }) => (
    <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-2 p-3 font-numeric text-sm first:mt-0">
      {children}
    </pre>
  ),

  blockquote: ({ children }) => (
    <blockquote className="mt-2 border-border border-l-2 pl-3 text-ink-muted italic first:mt-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="mt-3 border-border" />,

  // Same reason as `pre`: a wide table scrolls itself rather than the sheet.
  table: ({ children }) => (
    <div className="mt-2 overflow-x-auto first:mt-0">
      <table className="w-full text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-border border-b px-2 py-1 font-bold">{children}</th>,
  td: ({ children }) => <td className="border-border/50 border-b px-2 py-1">{children}</td>,
};

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={className}>
      {/*
        GFM for the things people actually type: `- [ ]` task lists, `~~`,
        tables, and bare URLs becoming links.

        `remark-breaks` because **a single newline has to stay a line break**.
        Markdown's own rule is that one newline is a space, which would take
        every description already written as a list of steps and reflow it into
        one run-on paragraph — silently, on data the author cannot see is being
        reinterpreted. The old renderer used `whitespace-pre-line` and this is
        the same promise kept by other means. Nobody typing notes into a
        textarea means "join these lines".
      */}
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
