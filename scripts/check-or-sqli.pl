#!/usr/bin/perl
# check-or-sqli.pl — Rafter v0.48 CI guard
#
# Detects PostgREST .or() filter injection in Angular frontend.
# Would have caught v0.46 regressions (20 callsites were unescaped).
#
# Rule: every ${...} interpolation in a .or(`...`) call that is NOT a
#       pre-escaped variable (safe*, searchPattern, s, s2, sq, st, companyId,
#       scope, profile.*) MUST go through escapeOrFilterValue/escapeLike/etc.

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
  return if $rel =~ /\/shared\/.*\.test\.ts$/;
  my $full = "$BASE/$rel";
  return unless -e $full;
  open(my $fh, '<', $full) or return;
  local $/;
  my $content = <$fh>;
  close($fh);
  return unless defined $content;

  # Collect all escape-based variable assignments with their line numbers.
  my @assignments;
  my @lines = split /\n/, $content, -1;
  for (my $i = 0; $i < @lines; $i++) {
    my $line = $lines[$i];
    if ($line =~ /(?:const|let|var)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*/) {
      my $varname = $1;
      my $end = ($i+2 > $#lines) ? $#lines : $i+2;
      my $context = join("\n", @lines[$i .. $end]);
      if ($context =~ /escapeOrFilterValue|escapeLike|escapeLikeForOr|JSON\.stringify/) {
        push @assignments, [$i + 1, $varname];
      }
    }
  }

  while ($content =~ /\.or\(\s*`((?:[^`\\]|\\.)*)`/g) {
    my $body = $1;
    next unless $body =~ /\$\{/;
    my $pos = pos($content);
    my $before = substr($content, 0, $pos);
    my $or_line = () = $before =~ /\n/g;
    $or_line++;
    while ($body =~ /\$\{([^}]+)\}/g) {
      my $var = $1;
      # Allow: contains an escape function call (escapeOrFilterValue, escapeLike, etc.)
      next if $var =~ /escapeOrFilterValue\(|escapeLike\(|escapeLikeForOr\(|escape\(|JSON\.stringify\(/;
      # Allow: any variable starting with `safe` (safeTerm, safeQuery, safeTags)
      next if $var =~ /^safe[A-Z]?[a-zA-Z]*$/;
      # Allow: searchPattern (convention for pre-escaped ilike pattern)
      next if $var =~ /^searchPattern$/;
      # Allow: short single-letter or sN variables (by-convention pre-escaped)
      next if $var =~ /^s[0-9]*$/;
      next if $var =~ /^sq$/;
      next if $var =~ /^st$/;
      # Allow: auth-context identifiers
      next if $var =~ /^(companyId|company_id)$/;
      next if $var =~ /^profile\.[a-zA-Z_]+$/;
      # Allow: typed union literal (e.g. scope: 'clients' | 'tickets' | 'services')
      next if $var =~ /^scope$/;
      # Allow: variable assigned via escape function in the prior 15 lines
      # (Rafter v0.54: bumped from 5 to 15 because real code has comments
      # and blank lines between the assignment and the .or() call).
      my $assigned_line;
      for my $a (@assignments) {
        next unless $a->[1] eq $var;
        next if $a->[0] >= $or_line;
        $assigned_line = $a->[0] if !defined($assigned_line) || $a->[0] > $assigned_line;
      }
      next if defined($assigned_line) && ($or_line - $assigned_line) <= 15;
      # Allow: if the SAME .or() block has escapeOrFilterValue/escapeLike call
      next if $body =~ /escapeOrFilterValue\(|escapeLike\(/;
      push @violations, "$rel:$or_line: .or(\${$var}) (user input without escapeOrFilterValue)";
    }
  }
}

find(\&check_file, 'src/app');

if (@violations) {
  print "::error::Potential .or() filter injection in frontend (user input without escapeOrFilterValue):\n";
  print join("\n", @violations), "\n";
  exit 1;
}
print "No .or() SQLi sinks found in frontend.\n";
exit 0;
