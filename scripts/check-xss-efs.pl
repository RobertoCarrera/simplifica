#!/usr/bin/perl
# check-xss-efs.pl — Rafter v0.48 CI guard
#
# Detects XSS in Edge Function html:/html_body: template literals.
# Would have caught v0.45 regressions in process-reminders + process-automation.
#
# Rule: every ${...} interpolation in an html: template literal that contains
#       a user-controlled field access (client.name, booking.client.name, etc.)
#       MUST be wrapped in escapeHtml(...) or another escaping function call.
#
# Exit 0 with no output if clean. Exits non-zero via the workflow wrapper if violations found.

use strict;
use warnings;
use File::Find;
use Cwd qw(getcwd);

my $BASE = getcwd();
my @violations;

# User-controlled field access patterns. These are the EXACT patterns the v0.45
# Rafter sweep fixed. Keep this list focused on the actual historical regressions.
my @user_input_patterns = (
  qr/\bclient\s*\??\.s*name\b/,
  qr/\bclient\s*\??\.s*surname\b/,
  qr/\bclient\s*\??\.s*email\b/,
  qr/\bclient\s*\??\.s*phone\b/,
  qr/\bclient\s*\??\.s*full_name\b/,
  qr/\bclient\s*\??\.s*display_name\b/,
  qr/\buser\s*\??\.s*name\b/,
  qr/\buser\s*\??\.s*email\b/,
  qr/\bprofile\s*\??\.s*name\b/,
  qr/\bprofile\s*\??\.s*email\b/,
  qr/\bprofile\s*\??\.s*full_name\b/,
  qr/\bbooking\s*\??\.s*client\s*\??\.s*name\b/,
  qr/\bbooking\s*\??\.s*client\s*\??\.s*surname\b/,
  qr/\bbooking\s*\??\.s*client\s*\??\.s*email\b/,
  qr/\bbooking\s*\??\.s*service\s*\??\.s*name\b/,
  qr/\bbooking\s*\??\.s*service\s*\??\.s*description\b/,
  qr/\bservice\s*\??\.s*name\b/,
  qr/\bservice\s*\??\.s*description\b/,
  qr/\brecipient\s*\??\.s*name\b/,
  qr/\brecipient\s*\??\.s*email\b/,
  qr/\bcontact\s*\??\.s*name\b/,
  qr/\bcontact\s*\??\.s*email\b/,
);

sub check_file {
  my $rel = $File::Find::name;
  return unless $rel =~ /\.ts$/;
  return if $rel =~ /\/_shared\//;
  return if $rel =~ /\/escape\.ts$/;
  my $full = "$BASE/$rel";
  return unless -e $full;
  open(my $fh, '<', $full) or return;
  local $/;
  my $content = <$fh>;
  close($fh);
  return unless defined $content;

  while ($content =~ /\b(html|html_body|htmlContent)\s*[:=]\s*`((?:[^`\\]|\\.)*)`/g) {
    my ($key, $body) = ($1, $2);
    next unless $body =~ /\$\{/;
    my $pos = pos($content);
    my $before = substr($content, 0, $pos);
    my $tmpl_line = () = $before =~ /\n/g;
    $tmpl_line++;
    while ($body =~ /\$\{([^}]+)\}/g) {
      my $interp = $1;
      # Allow: contains an escape function call (escapeHtml, escape, .replace, etc.)
      # Note: NOT just any `(` — parens for grouping like `(x || '')` are NOT safe.
      next if $interp =~ /escapeHtml\(|escape\(|escapeLike\(|escapeOrFilterValue\(|sanitize\(/i;
      next if $interp =~ /\.\s*replace\s*\(/;
      # Allow: ternary/comparison with literals only (no raw user input)
      next if $interp =~ /^[a-zA-Z_]+\s*(===|!==|==|!=|<|>)\s*['"`]/;
      # Flag if interpolation matches any user-input pattern
      my $matched = 0;
      for my $p (@user_input_patterns) {
        if ($interp =~ $p) {
          $matched = 1;
          last;
        }
      }
      next unless $matched;
      push @violations, "$rel:$tmpl_line: ${key}:\`...\${$interp}...\` (user input without escapeHtml)";
    }
  }
}

find(\&check_file, 'supabase/functions');

if (@violations) {
  print "::error::Potential XSS in Edge Function email body (variable interpolated without escapeHtml):\n";
  print join("\n", @violations), "\n";
  exit 1;
}
print "No XSS sinks found in EFs.\n";
exit 0;
