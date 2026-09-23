# Chapter 11 assessment

Before touching the debugger, use this chapter's rules on cause preservation and exception translation to predict what **Preserve the original cause** should print, then run it and repair the defect so the caught NumberFormatException survives as the thrown exception's cause.

The parsePort function lab exercises boundary validation in isolation; it is not proof of every competency from checked-versus-unchecked design through safe user-facing error reporting covered across the chapter's five lessons. Review the repaired source and explain why forwarding the cause matters for diagnosis, without consulting the answer.
