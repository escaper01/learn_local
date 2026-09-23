// Instructor-only verification fixtures. Never included in the LearnPack archive.
// These references verify test expectations; they do not generate lesson content.
export const functionBodies = [
  "return value1.endsWith(\".class\");",
  "return ((double)value1 + (double)value2) / 2;",
  "return value1 < 0 ? \"negative\" : value1 == 0 ? \"zero\" : \"positive\";",
  "int[] out=new int[value1.length]; for(int i=0;i<out.length;i++)out[i]=value1[out.length-1-i];return out;",
  "return value2>0 ? value1+value2 : value1;",
  "return switch(value1){case \"NEW\"->\"queued\";case \"DONE\"->\"completed\";default->\"unknown\";};",
  "return value1.trim().equals(value2.trim());",
  "int start=Math.max(0,Math.min(value1.length,value2)),end=Math.max(0,Math.min(value1.length,value3));return end<=start?new int[0]:java.util.Arrays.copyOfRange(value1,start,end);",
  "int n=0;for(String v:value1)if(v.equals(value2))n++;return n;",
  "int lo=0,hi=value1.length;while(lo<hi){int mid=lo+(hi-lo)/2;if(value1[mid]<value2)lo=mid+1;else hi=mid;}return lo;",
  "try{int p=Integer.parseInt(value1);return p>=1&&p<=65535?p:-1;}catch(NumberFormatException e){return -1;}",
  "return value1.matches(\"[A-Z]{2}-[0-9]{4}\");",
  "String s=value1.trim().toLowerCase(java.util.Locale.ROOT);return s.isEmpty()?\"UNKNOWN\":s;",
  "return java.util.Arrays.stream(value1).filter(v->v%2==0).map(v->v*v).sum();",
  "return \"expected=\"+value1+\", actual=\"+value2;",
  "return value1.trim()+\"-\"+value2.trim()+\".jar\";",
  "try(var executor=java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()){var results=new java.util.ArrayList<java.util.concurrent.Future<Integer>>();for(int v:values)results.add(executor.submit(()->v));int total=0;for(var f:results)total+=f.get();return total;}catch(InterruptedException e){Thread.currentThread().interrupt();throw new IllegalStateException(e);}catch(java.util.concurrent.ExecutionException e){throw new IllegalStateException(e.getCause());}",
  "if(value1>=5)return 30000;return 1000<<Math.max(0,value1);",
  "return value1<=0?\"\":String.join(\",\",java.util.Collections.nCopies(value1,\"?\"));",
  "int percent=Math.max(0,Math.min(100,value2));return value1-value1*percent/100;",
  "Class<?> type=switch(selector){case \"Task\"->Task.class;case \"Owner\"->Owner.class;default->null;};if(type==null)return \"\";return java.util.Arrays.stream(type.getRecordComponents()).map(java.lang.reflect.RecordComponent::getName).collect(java.util.stream.Collectors.joining(\",\"));",
  "if(capacity<=0)return 0;var cache=new java.util.LinkedHashMap<String,Boolean>(16,0.75f,true);int hits=0;for(String key:keys){if(cache.get(key)!=null)hits++;cache.put(key,true);if(cache.size()>capacity)cache.remove(cache.keySet().iterator().next());}return hits;",
  "return value1.length()<=4?\"***\":\"***\"+value1.substring(value1.length()-4);",
  "return switch(value1){case \"CREATED\"->201;case \"MISSING\"->404;default->500;};",
  "return value1&&value2&&!value3?\"READY\":\"NOT_READY\";"
];
export const projectBodies = {
  "Ledger": "long balance=0;var output=new java.util.ArrayList<String>();for(String line:input.split(\"\\\\R\")){if(line.isBlank())continue;try{String[] fields=line.trim().split(\"\\\\|\",-1);if(fields.length!=2)throw new IllegalArgumentException();String command=fields[0].trim();long amount=Long.parseLong(fields[1].trim());if(amount<=0)throw new IllegalArgumentException();if(command.equals(\"IN\"))balance=Math.addExact(balance,amount);else if(command.equals(\"OUT\")&&amount<=balance)balance-=amount;else throw new IllegalArgumentException();output.add(\"OK\");}catch(IllegalArgumentException|ArithmeticException error){output.add(\"ERROR\");}}output.add(\"BALANCE=\"+balance);return String.join(\"\\n\",output);",
  "IssueIndex": "record Issue(int id,int priority,String title){}var tasks=new java.util.HashMap<Integer,Issue>();int errors=0;for(String line:input.split(\"\\\\R\")){if(line.isBlank())continue;try{String[] f=line.trim().split(\"\\\\|\",-1);if(f.length!=3)throw new IllegalArgumentException();int id=Integer.parseInt(f[0].trim()),p=Integer.parseInt(f[1].trim());String title=f[2].trim();if(id<=0||p<1||p>3||title.isEmpty()||tasks.containsKey(id))throw new IllegalArgumentException();tasks.put(id,new Issue(id,p,title));}catch(IllegalArgumentException e){errors++;}}var sorted=new java.util.ArrayList<>(tasks.values());sorted.sort(java.util.Comparator.comparingInt(Issue::priority).reversed().thenComparingInt(Issue::id));var out=new java.util.ArrayList<String>();for(var t:sorted)out.add(t.id()+\"|\"+t.priority()+\"|\"+t.title());out.add(\"ERRORS=\"+errors);return String.join(\"\\n\",out);",
  "MonthlyReport": "var totals=new java.util.TreeMap<java.time.YearMonth,Long>();int errors=0;for(String line:input.split(\"\\\\R\")){if(line.isBlank())continue;try{String[] f=line.trim().split(\"\\\\|\",-1);if(f.length!=2)throw new IllegalArgumentException();String text=f[0].trim();if(!text.matches(\"[0-9]{4}-[0-9]{2}-[0-9]{2}\"))throw new IllegalArgumentException();var date=java.time.LocalDate.parse(text);int cents=Integer.parseInt(f[1].trim());if(date.getYear()<1||cents<=0)throw new IllegalArgumentException();totals.merge(java.time.YearMonth.from(date),(long)cents,Long::sum);}catch(java.time.DateTimeException|IllegalArgumentException e){errors++;}}var out=new java.util.ArrayList<String>();totals.forEach((month,total)->out.add(month+\"=\"+total));out.add(\"ERRORS=\"+errors);return String.join(\"\\n\",out);",
  "EventLedger": "var seen=new java.util.HashMap<String,Long>();long total=0;var out=new java.util.ArrayList<String>();for(String line:input.split(\"\\\\R\")){if(line.isBlank())continue;try{String[] f=line.trim().split(\"\\\\|\",-1);if(f.length!=2)throw new IllegalArgumentException();String id=f[0].trim();long amount=Long.parseLong(f[1].trim());if(!id.matches(\"[A-Za-z0-9_-]{1,40}\")||amount<=0)throw new IllegalArgumentException();if(seen.containsKey(id)){out.add(seen.get(id)==amount?\"DUPLICATE\":\"CONFLICT\");continue;}long next=Math.addExact(total,amount);seen.put(id,amount);total=next;out.add(\"APPLIED\");}catch(IllegalArgumentException|ArithmeticException e){out.add(\"ERROR\");}}out.add(\"TOTAL=\"+total);return String.join(\"\\n\",out);",
  "SecureImport": "var seen=new java.util.HashSet<String>();var out=new java.util.ArrayList<String>();for(String line:input.split(\"\\\\R\")){if(line.isBlank())continue;String[] f=line.trim().split(\"\\\\|\",-1);if(f.length!=3){out.add(\"ERROR\");continue;}String id=f[0].trim(),title=f[1].trim(),secret=f[2].trim();if(!id.matches(\"[A-Za-z0-9_-]{1,20}\")||!title.matches(\"[A-Za-z0-9 _-]{1,40}\")||!secret.matches(\"[A-Za-z0-9]+\")||seen.size()>=3||seen.contains(id)){out.add(\"ERROR\");continue;}seen.add(id);out.add(id+\"|\"+title+\"|\"+(secret.length()<=4?\"***\":\"***\"+secret.substring(secret.length()-4)));}return String.join(\"\\n\",out);",
  "TaskService": "record Task(String title,boolean done){}var tasks=new java.util.TreeMap<Integer,Task>();var out=new java.util.ArrayList<String>();for(String line:input.split(\"\\\\R\")){if(line.isBlank())continue;try{String[] f=java.util.Arrays.stream(line.trim().split(\"\\\\|\",-1)).map(String::trim).toArray(String[]::new);String command=f[0];if(command.equals(\"LIST\")&&f.length==1){var parts=new java.util.ArrayList<String>();tasks.forEach((id,t)->parts.add(id+\":\"+(t.done()?\"DONE\":\"OPEN\")+\":\"+t.title()));out.add(parts.isEmpty()?\"EMPTY\":String.join(\";\",parts));continue;}if(command.equals(\"STATS\")&&f.length==1){long done=tasks.values().stream().filter(Task::done).count();out.add(\"OPEN=\"+(tasks.size()-done)+\",DONE=\"+done);continue;}if(f.length<2)throw new IllegalArgumentException();int id=Integer.parseInt(f[1]);if(id<=0)throw new IllegalArgumentException();switch(command){case \"ADD\"->{if(f.length!=3||f[2].isEmpty()||f[2].contains(\";\")||tasks.containsKey(id))throw new IllegalArgumentException();tasks.put(id,new Task(f[2],false));}case \"DONE\"->{if(f.length!=2||!tasks.containsKey(id))throw new IllegalArgumentException();tasks.put(id,new Task(tasks.get(id).title(),true));}case \"REMOVE\"->{if(f.length!=2||!tasks.containsKey(id))throw new IllegalArgumentException();tasks.remove(id);}default->throw new IllegalArgumentException();}out.add(\"OK\");}catch(IllegalArgumentException e){out.add(\"ERROR\");}}return String.join(\"\\n\",out);"
};
export const debugRepairs = [
  [
    "static void main",
    "public static void main"
  ],
  [
    "(2 + 3) / 2",
    "(2 + 3) / 2.0"
  ],
  [
    "i<4",
    "i<=4"
  ],
  [
    "int[] sorted=original",
    "int[] sorted=java.util.Arrays.copyOf(original,original.length)"
  ],
  [
    "balance-=n; if(n>10)return;",
    "if(n<=0||n>balance)return; balance-=n;"
  ],
  [
    "record Team(java.util.List<String> names) {}",
    "record Team(java.util.List<String> names) { Team { names=java.util.List.copyOf(names); } }"
  ],
  [
    "return System.identityHashCode(this);",
    "return Integer.hashCode(id);"
  ],
  [
    "java.util.List<T> from, java.util.List<T> to",
    "java.util.List<? extends T> from, java.util.List<? super T> to"
  ],
  [
    "java.util.Comparator.comparingInt(Person::age)",
    "java.util.Comparator.comparingInt(Person::age).thenComparing(Person::name)"
  ],
  [
    "a[mid]<=3",
    "a[mid]<3"
  ],
  [
    "new IllegalArgumentException(\"quantity\")",
    "new IllegalArgumentException(\"quantity\",e)"
  ],
  [
    "m.find()",
    "m.matches()"
  ],
  [
    ".orElse(fallback())",
    ".orElseGet(Main::fallback)"
  ],
  [
    ".map(s->java.util.Arrays.stream",
    ".flatMap(s->java.util.Arrays.stream"
  ],
  [
    "assert 2+2==5;",
    "if(2+2!=5)throw new AssertionError();"
  ],
  [
    "exitCode>=0",
    "exitCode==0"
  ],
  [
    "catch(InterruptedException e){}",
    "catch(InterruptedException e){Thread.currentThread().interrupt();}"
  ],
  [
    "status<500",
    "status>=200&&status<300"
  ],
  [
    "owner_id = NULL",
    "owner_id IS NULL"
  ],
  [
    "return n;}",
    "return p.apply(n);}"
  ],
  [
    "\"substring\",Integer.class",
    "\"substring\",int.class"
  ],
  [
    "size()>3",
    "size()>2"
  ],
  [
    "secret.length()<=4 ? secret",
    "secret.length()<=4 ? \"***\""
  ],
  [
    "WHERE id = ?\";",
    "WHERE id = ? AND version = ?\";"
  ],
  [
    "database&&queue ?",
    "database&&queue&&!shuttingDown ?"
  ]
];
