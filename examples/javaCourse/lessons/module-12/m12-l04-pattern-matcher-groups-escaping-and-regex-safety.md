# Pattern, Matcher, groups, escaping, and regex safety

## Compile grammar, then match input
```java
var pattern = java.util.regex.Pattern.compile("([A-Z]{2})-([0-9]{4})");
var matcher = pattern.matcher("JV-0021");
if (matcher.matches()) {
    System.out.println(matcher.group(1)); // JV
    System.out.println(matcher.group(2)); // 0021
}
```
matches requires the whole input region; find searches for a matching subsequence and advances matcher state. Pattern is reusable; Matcher belongs to one input operation. Access groups only after a successful match.

Character classes choose one character, quantifiers repeat, parentheses capture, and | expresses alternatives. Regex backslashes must also survive Java string escaping: "\\d+" in source represents the regex digit shorthand. Use Pattern.quote for literal search text and Matcher.quoteReplacement for literal replacement text; they solve different escaping problems.

## Practice and limits
Reject lowercase codes, extra prefixes, missing digits, and extra suffixes. Extract several codes with find. Avoid nested ambiguous quantifiers on untrusted long input because backtracking can consume excessive CPU. Limit input size and use a parser for structured formats such as JSON rather than growing an unreadable expression.
