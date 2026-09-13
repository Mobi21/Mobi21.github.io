import type { HTMLAttributes } from "react";
import { defaultRehypePlugins, Streamdown } from "streamdown";

type BrainMarkdownHeadingProps = HTMLAttributes<HTMLHeadingElement> & { node?: unknown };
type BrainMarkdownHeadingBase = 3 | 4;
type MarkdownAstNode = {
  type: string;
  tagName?: string;
  children?: MarkdownAstNode[];
};

/** Adapt the parsed Markdown tree, keeping source text and relative depth
 * intact. Using HAST here means Setext headings, blockquotes, lists and fenced
 * examples follow Streamdown's parser rather than a second partial parser. */
function headingHierarchyPlugin(headingBase: BrainMarkdownHeadingBase) {
  return () => (tree: MarkdownAstNode) => {
    const headings: Array<{ node: MarkdownAstNode; level: number }> = [];
    const visit = (node: MarkdownAstNode) => {
      const match = /^h([1-6])$/.exec(node.tagName ?? "");
      if (node.type === "element" && match) headings.push({ node, level: Number(match[1]) });
      node.children?.forEach(visit);
    };
    visit(tree);
    if (!headings.length) return;

    const minimumSourceLevel = Math.min(...headings.map(({ level }) => level));
    for (const { node, level } of headings) {
      const renderedLevel = Math.max(3, Math.min(6, headingBase + level - minimumSourceLevel));
      node.tagName = `h${renderedLevel}`;
    }
  };
}

function Heading3({ node: _node, className, ...props }: BrainMarkdownHeadingProps) {
  return <h3 className={`brain-markdown__heading ${className ?? ""}`.trim()} {...props} />;
}

function Heading4({ node: _node, className, ...props }: BrainMarkdownHeadingProps) {
  return <h4 className={`brain-markdown__heading ${className ?? ""}`.trim()} {...props} />;
}

function Heading5({ node: _node, className, ...props }: BrainMarkdownHeadingProps) {
  return <h5 className={`brain-markdown__heading ${className ?? ""}`.trim()} {...props} />;
}

function Heading6({ node: _node, className, ...props }: BrainMarkdownHeadingProps) {
  return <h6 className={`brain-markdown__heading ${className ?? ""}`.trim()} {...props} />;
}

function headingRenderer(level: number) {
  const normalizedLevel = Math.max(3, Math.min(6, level));
  if (normalizedLevel === 3) return Heading3;
  if (normalizedLevel === 4) return Heading4;
  if (normalizedLevel === 5) return Heading5;
  return Heading6;
}

function markdownComponents() {
  return {
    h1: headingRenderer(1),
    h2: headingRenderer(2),
    h3: headingRenderer(3),
    h4: headingRenderer(4),
    h5: headingRenderer(5),
    h6: headingRenderer(6),
  };
}

/**
 * Render stored Markdown beneath an object heading without changing its
 * source. The heading base keeps route-local hierarchy inside the document.
 */
export function BrainMarkdown({
  children,
  className,
  headingBase = 3,
  as = "div",
}: {
  children: string;
  className?: string;
  headingBase?: BrainMarkdownHeadingBase;
  as?: "div" | "article";
}) {
  const Root = as;
  return (
    <Root className={className}>
      <Streamdown
        mode="static"
        components={markdownComponents()}
        rehypePlugins={[...Object.values(defaultRehypePlugins), headingHierarchyPlugin(headingBase)]}
      >
        {children}
      </Streamdown>
    </Root>
  );
}
