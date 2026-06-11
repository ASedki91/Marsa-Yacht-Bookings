---
name: Drizzle ANY array bug
description: sql`col = ANY(${jsArray})` generates invalid SQL tuples — use inArray() instead
---

## Rule
Never use `sql\`${col} = ANY(${jsArray})\`` to match an array of values in Drizzle ORM.

**Why:** Drizzle serializes a JS array inside a `sql` template as a tuple `($1, $2, $3)` which is invalid for PostgreSQL's `ANY()` operator (it needs an array literal or subquery, not a tuple). The query fails at runtime with a parse error, causing a 500 response.

**How to apply:** Use `inArray(col, array)` from `drizzle-orm` instead — it generates correct `col = ANY(ARRAY[$1, $2, ...])` SQL. If the array might be empty, guard with `array.length ? inArray(...) : sql\`FALSE\`` to avoid an empty-array error.
