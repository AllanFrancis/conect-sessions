import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "@/components/markdown";
const html = renderToStaticMarkup(
  <Markdown content={"| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst x = 1;\n```\n"} />,
);
console.log(html.replace(/></g, ">\n<"));
