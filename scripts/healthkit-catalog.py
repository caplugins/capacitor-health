import re,sys,os
H=sys.argv[1]
src=open(os.path.join(H,'HKTypeIdentifiers.h')).read()
lines=src.splitlines()
out=[]
section=None; group=None
kinds={'HKQuantityTypeIdentifier':'Quantity','HKCategoryTypeIdentifier':'Category','HKCharacteristicTypeIdentifier':'Characteristic','HKCorrelationTypeIdentifier':'Correlation','HKDocumentTypeIdentifier':'Document','HKScoredAssessmentTypeIdentifier':'Scored assessment','HKMedicationDoseEventTypeIdentifier':'Medication dose event'}
rows=[]
for l in lines:
    m=re.match(r'^//\s*(.+?)\s*$',l.strip())
    if m and not l.strip().startswith('//-') and 'Copyright' not in l and len(m.group(1))<60 and not m.group(1).startswith('HK'):
        group=m.group(1); continue
    m=re.search(r'HK_EXTERN\s+(\w+)\s+const\s+(\w+)\s+(.*?);\s*(//\s*(.*))?$',l)
    if not m: 
        m2=re.search(r'HK_EXTERN\s+NSString\s*\*\s*const\s+(HK\w+TypeIdentifier\w+)\s+(.*?);\s*(//\s*(.*))?$',l)
        if m2: rows.append(('Other',group,m2.group(1),m2.group(2),m2.group(4) or ''))
        continue
    t,name,attrs,_,cm=m.groups()
    rows.append((kinds.get(t,t),group,name,attrs,cm or ''))
def ios(attrs):
    m=re.search(r'ios\(([\d.]+)',attrs); dep=re.search(r'API_DEPRECATED[^;]*?ios\(([\d.]+),\s*([\d.]+|API_TO_BE_DEPRECATED)',attrs)
    v=m.group(1) if m else ('?' )
    if dep: return dep.group(1), 'deprecated '+dep.group(2)
    if 'API_DEPRECATED' in attrs: return v,'deprecated'
    if 'ios(' not in attrs and 'API_UNAVAILABLE(ios' in attrs: return '—','unavailable on iOS'
    return v,''
from collections import OrderedDict
by=OrderedDict()
for k,g,n,a,c in rows: by.setdefault(k,[]).append((g,n,a,c))
total=0
for k,items in by.items():
    print(f"\n## {k} types ({len(items)})\n")
    print("| Group | Identifier | iOS | Notes (unit/aggregation or value enum, from header) |\n|---|---|---|---|")
    for g,n,a,c in items:
        v,dep=ios(a); total+=1
        short=re.sub(r'^HK\w*?TypeIdentifier','',n)
        note=c.strip()
        if dep: note=(note+' · **'+dep+'**').strip(' ·')
        print(f"| {g or ''} | `{short}` | {v} | {note} |")
print(f"\n_Total identifiers: {total}_", file=sys.stderr)
