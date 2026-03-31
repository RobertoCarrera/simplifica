import { Pipe, PipeTransform, inject } from "@angular/core";
import { DomSanitizer, SafeHtml } from "@angular/platform-browser";
import DOMPurify from "dompurify";

@Pipe({
  name: "safeHtml",
  standalone: true,
})
export class SafeHtmlPipe implements PipeTransform {
  private sanitizer = inject(DomSanitizer);

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return "";

    // 1. Sanitize the HTML with a strict allowlist
    const cleanHtml = DOMPurify.sanitize(value, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "b",
        "i",
        "em",
        "strong",
        "u",
        "s",
        "strike",
        "ul",
        "ol",
        "li",
        "a",
        "span",
        "div",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "pre",
        "code",
        "hr",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "img",
        "mark",
      ],
      ALLOWED_ATTR: [
        "href",
        "target",
        "rel",
        "class",
        "style",
        "src",
        "alt",
        "width",
        "height",
        "colspan",
        "rowspan",
      ],
      // Force safe link behavior
      ADD_ATTR: ["target"],
      FORBID_TAGS: [
        "script",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "textarea",
        "select",
        "button",
      ],
      FORBID_ATTR: [
        "onerror",
        "onload",
        "onclick",
        "onmouseover",
        "onfocus",
        "onblur",
      ],
    });

    // 2. Strip url() and expression() from inline style attributes to prevent
    //    CSS-based data exfiltration (tracking beacons via background-image,
    //    list-style-image, etc.) and legacy IE CSS expression() injection.
    const safeHtml = cleanHtml.replace(
      /style="([^"]*)"/gi,
      (_, cssValue: string) => {
        const stripped = cssValue
          .replace(/url\s*\([^)]*\)/gi, "")
          .replace(/expression\s*\([^)]*\)/gi, "");
        return `style="${stripped}"`;
      },
    );

    // 3. Trust the sanitized HTML (bypassing Angular's default stripper)
    return this.sanitizer.bypassSecurityTrustHtml(safeHtml);
  }
}
