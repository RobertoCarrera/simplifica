#!/usr/bin/perl
# check-ilike-sqli.pl — Rafter v0.48 CI guard
#
# Detects PostgREST .ilike() LIKE wildcard injection in Angular frontend.
# Would have caught v0.46 regressions.
#
# Rule: every .ilike('col', `...${var}...`) interpolation MUST go through
#       escapeLike() or be a known-safe variable name.

use strict;
use warnings;
use File::Find;
use Cwd qw(getcwd);

my $BASE = getcwd();
my @violations;

sub check_file {
  my $rel = $File::Find::name;
  return unless $rel =~ /\.ts$/;
  return if $rel =~ /\/escape-like\.ts$/;
  my $full = "$BASE/$rel";
  return unless -e $full;
  open(my $fh, '<', $full) or return;
  local $/;
  my $content = <$fh>;
  close($fh);
  return unless defined $content;

  while ($content =~ /\.ilike\(\s*['"]([^'"]+)['"]\s*,\s*`((?:[^`\\]|\\.)*)`/g) {
    my ($col, $body) = ($1, $2);
    next unless $body =~ /\$\{/;
    my $pos = pos($content);
    my $before = substr($content, 0, $pos);
    my $ilike_line = () = $before =~ /\n/g;
    $ilike_line++;
    while ($body =~ /\$\{([^}]+)\}/g) {
      my $var = $1;
      # Allow: contains escapeLike/escapeOrFilterValue function call
      next if $var =~ /escapeLike\(|escapeOrFilterValue\(|escape\(/;
      # Allow: any variable starting with `safe`
      next if $var =~ /^safe[A-Z]?[a-zA-Z]*$/;
      # Allow: short single-letter or sN variables
      next if $var =~ /^s[0-9]*$/;
      next if $var =~ /^sq$/;
      push @violations, "$rel:$ilike_line: .ilike('$col', \`\${$var}\`) (user input without escapeLike)";
    }
  }
}

find(\&check_file, 'src/app');

if (@violations) {
  print "::error::Potential LIKE wildcard injection in frontend (user input without escapeLike):\n";
  print join("\n", @violations), "\n";
  exit 1;
}
print "No .ilike() SQLi sinks found in frontend.\n";
exit 0;
