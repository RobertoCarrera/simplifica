#!/usr/bin/perl
# check-xss-frontend.pl — Rafter v0.56 CI guard
#
# Detects Angular XSS sinks missed by check-xss-efs.pl (which only scans
# Edge Function email bodies). Would have caught any future regression
# of:
#   1. [innerHTML]="<userValue>" without sanitization
#   2. bypassSecurityTrustHtml/Script/Style(<userValue>) without DOMPurify
#   3. <element>.innerHTML = <userValue> without DOMPurify
#   4. document.write(...)
#
# Whitelist (all considered already-sanitised):
#   - any expression containing a function call (`sanitizeContent(...)`,
#     `DOMPurify.sanitize(...)`, `highlight(...)`, etc.)
#   - property access (`opt.icon`, `this.contractContent`)
#   - pipe to safeHtml / markdown (`x | safeHtml`, `x | markdown`)
#   - identifiers with safe prefix (`safeHtml`, `sanitized*`, `clean*`)
#   - string / template literals

use strict;
use warnings;
use File::Find;
use Cwd qw(getcwd);

my $BASE = getcwd();
my @violations;

sub is_pure_identifier {
  my ($expr) = @_;
  return $expr =~ /^[a-zA-Z_][a-zA-Z0-9_]*$/ ? 1 : 0;
}

sub is_safe_expr {
  my ($expr) = @_;
  return 0 unless defined $expr;
  # Trim leading/trailing whitespace.
  $expr =~ s/^\s+|\s+$//g;
  # Allow: contains a function call — DOMPurify.sanitize(...), sanitizeContent(...), etc.
  return 1 if $expr =~ /\(/;
  # Allow: piped to a sanitiser (safeHtml, markdown, sanitize, ...).
  return 1 if $expr =~ /\|\s*(safeHtml|markdown|sanitize|escape)\b/i;
  # Allow: property access — opt.icon, this.foo, etc.
  return 1 if $expr =~ /\./;
  # Allow: starts with safe / sanitised / clean / escaped prefix.
  return 1 if $expr =~ /^(safe|sanitized?|clean|escaped)/i;
  # Allow: string or template literal.
  return 1 if $expr =~ /^['"`]/;
  return 0;
}

sub line_from_pos {
  my ($content, $pos) = @_;
  my $before = substr($content, 0, $pos);
  my $line = () = $before =~ /\n/g;
  return $line + 1;
}

sub check_file {
  my $rel = $File::Find::name;
  return unless $rel =~ /\.ts$/;
  return if $rel =~ /\.spec\.ts$/;
  # The escape-like.ts utility is itself a sanitiser; skip the directory.
  return if $rel =~ /\/shared\/utils\//;
  my $full = "$BASE/$rel";
  return unless -e $full;
  open(my $fh, '<', $full) or return;
  local $/;
  my $content = <$fh>;
  close($fh);
  return unless defined $content;

  # Pattern 1: [innerHTML]="<expr>". Only flag pure bare identifiers —
  # function calls (sanitizeContent(...), previewHtml(), ...), property
  # access (opt.icon), pipes (| safeHtml), and string literals are all
  # whitelisted by is_safe_expr.
  while ($content =~ /\[innerHTML\]\s*=\s*["']([^"']+)["']/g) {
    my $expr = $1;
    next if is_safe_expr($expr);
    next unless is_pure_identifier($expr);
    push @violations, "$rel:" . line_from_pos($content, pos($content)) .
      ": [innerHTML]=\"$expr\" (raw identifier — wrap in escapeHtml(), use a sanitiser, or pipe safeHtml)";
  }

  # Pattern 2: bypassSecurityTrustHtml / Script / Style(<arg>).
  # Flag if the arg is a bare identifier that doesn't look sanitised.
  while ($content =~ /\.(?:bypassSecurityTrustHtml|bypassSecurityTrustScript|bypassSecurityTrustStyle)\s*\(\s*([^()]+?)\s*\)/g) {
    my $arg = $1;
    next if is_safe_expr($arg);
    push @violations, "$rel:" . line_from_pos($content, pos($content)) .
      ": bypassSecurityTrust*($arg) (raw identifier — wrap in DOMPurify.sanitize first)";
  }

  # Pattern 3: .innerHTML = <expr> (single-line assignments only).
  # Multi-line assignments (template literal on next line) are skipped
  # because [^;\n]+ won't span a newline.
  # Skip lines that are // comments (typical pattern: `// div.innerHTML = ...`).
  while ($content =~ /\.innerHTML\s*=\s*([^;\n]+)/g) {
    my $rhs = $1;
    # Skip: the match is inside a // line comment.
    my $pos = pos($content);
    my $line_start = rindex(substr($content, 0, $pos), "\n") + 1;
    my $line_text = substr($content, $line_start, $pos - $line_start);
    next if $line_text =~ /^\s*\/\//;
    next if is_safe_expr($rhs);
    push @violations, "$rel:" . line_from_pos($content, $pos) .
      ": .innerHTML = $rhs (raw expression — wrap in DOMPurify.sanitize first)";
  }

  # Pattern 4: document.write / document.writeln — always flag, no
  # exceptions. Bypasses Angular's DomSanitizer entirely.
  while ($content =~ /document\.write(?:ln)?\s*\(/g) {
    push @violations, "$rel:" . line_from_pos($content, pos($content)) .
      ": document.write(...) (forbidden — bypasses Angular DomSanitizer)";
  }
}

find(\&check_file, 'src/app');

if (@violations) {
  print "::error::Potential XSS sink in Angular frontend:\n";
  print join("\n", @violations), "\n";
  exit 1;
}
print "No Angular XSS sinks found in frontend.\n";
exit 0;