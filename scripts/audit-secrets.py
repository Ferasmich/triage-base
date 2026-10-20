"""Read-only credential scan. Outputs locations and rule names, never values."""
import json, re, subprocess
from pathlib import Path

def git(*args):
    return subprocess.check_output(['git', *args])

known = []
for line in (Path('.env.local').read_text() if Path('.env.local').exists() else '').splitlines():
    if '=' not in line or line.lstrip().startswith('#'): continue
    name, value = line.split('=', 1)
    value = value.strip().strip('\"\'')
    if re.search(r'(API_KEY|TOKEN|SECRET|PASSWORD)$', name) and len(value) >= 12:
        known.append((name.strip(), value.encode()))
rules = [
    ('nvidia_api_key', rb'nvapi-[A-Za-z0-9_-]{24,}'),
    ('decision_api_key', rb'sk-vsr-[A-Za-z0-9]{40,}'),
    ('openrouter_api_key', rb'sk-or-v1-[A-Za-z0-9]{32,}'),
    ('openai_api_key', rb'sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}'),
    ('github_token', rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})'),
    ('aws_access_key', rb'AKIA[0-9A-Z]{16}'),
    ('private_key', rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
]
findings = []
counts = {}
def scan(scope, location, data):
    counts[scope] = counts.get(scope, 0) + 1
    matches = set(name for name, value in known if value in data)
    matches.update(name for name, pattern in rules if re.search(pattern, data))
    for rule in sorted(matches): findings.append({'scope': scope, 'location': location, 'rule': rule})

tracked = git('ls-files', '-z').decode().split('\0')
for name in filter(None, tracked):
    p = Path(name)
    if p.is_file(): scan('tracked_worktree', name, p.read_bytes())
for entry in git('ls-files', '--stage', '-z').decode().split('\0'):
    if not entry: continue
    metadata, name = entry.split('\t', 1)
    oid = metadata.split()[1]
    scan('index', name, git('cat-file', 'blob', oid))
objects = git('rev-list', '--objects', '--all').decode().splitlines()
seen = set()
for entry in objects:
    oid, _, name = entry.partition(' ')
    if oid in seen: continue
    seen.add(oid)
    if git('cat-file', '-t', oid).strip() == b'blob':
        scan('git_history', f'{oid}:{name}', git('cat-file', 'blob', oid))
for entry in git('log', '--all', '--format=%H%x00%B%x00').split(b'\0\n'):
    if b'\0' in entry:
        oid, message = entry.split(b'\0', 1)
        scan('commit_message', oid.decode().strip(), message)
for name in git('ls-files', '--others', '--exclude-standard', '-z').decode().split('\0'):
    if name and Path(name).is_file(): scan('untracked_submission_files', name, Path(name).read_bytes())
ignored = subprocess.run(['git', 'check-ignore', '-q', '.env.local']).returncode == 0
result = {'checked_at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
          'method': 'Exact configured credential matches plus provider-token/private-key signatures; reachable Git blobs and commit messages, index, tracked worktree, non-ignored untracked files.',
          'configured_credentials_checked': [name for name, _ in known], 'objects_scanned': counts,
          'env_local_ignored': ignored, 'staged_change_count': len(git('diff', '--cached', '--name-only').decode().splitlines()),
          'findings': findings, 'status': 'PASS' if not findings and ignored else 'FAIL',
          'limitations': 'Not an exhaustive proof that arbitrary secrets are absent; unreachable/dangling objects, external remotes and ignored runtime/build files are outside scope.'}
Path('docs/credential-audit.json').write_text(json.dumps(result, indent=2)+'\n')
print(json.dumps(result))

raise SystemExit(0 if result["status"] == "PASS" else 1)
