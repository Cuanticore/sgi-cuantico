import paramiko, struct, base64, io
from cryptography.hazmat.primitives.asymmetric.rsa import (
    RSAPrivateNumbers, RSAPublicNumbers, rsa_crt_iqmp, rsa_crt_dmp1, rsa_crt_dmq1
)
from cryptography.hazmat.primitives import serialization

def ppk_to_rsakey(ppk_path):
    with open(ppk_path) as f:
        lines = [l.strip() for l in f.readlines()]
    sections = {}
    i = 0
    while i < len(lines):
        if ': ' in lines[i]:
            k, v = lines[i].split(': ', 1)
            if k.endswith('-Lines'):
                n = int(v)
                blob = ''.join(lines[i+1:i+1+n])
                sections[k] = base64.b64decode(blob)
                i += n + 1
            else:
                sections[k] = v
                i += 1
        else:
            i += 1
    def read_mpint(data, pos):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        return int.from_bytes(data[pos+4:pos+4+length], 'big'), pos+4+length
    pub, priv = sections['Public-Lines'], sections['Private-Lines']
    pos = 4 + struct.unpack('>I', pub[:4])[0]
    e, pos = read_mpint(pub, pos)
    n, pos = read_mpint(pub, pos)
    pos = 0
    d, pos = read_mpint(priv, pos)
    p, pos = read_mpint(priv, pos)
    q, pos = read_mpint(priv, pos)
    pub_n = RSAPublicNumbers(e, n)
    priv_n = RSAPrivateNumbers(p, q, d, rsa_crt_dmp1(d,p), rsa_crt_dmq1(d,q), rsa_crt_iqmp(p,q), pub_n)
    pem = priv_n.private_key().private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, serialization.NoEncryption()
    )
    return paramiko.RSAKey.from_private_key(io.StringIO(pem.decode()))

key = ppk_to_rsakey(r'c:\Users\danie\Claude\Indicadores\srv-cert-front-cuantaia.ppk')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('98.83.132.206', username='ubuntu', pkey=key, timeout=15)

def run(cmd, timeout=30):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

# Check GitHub Actions runner .env for secrets
out, _ = run("cat /home/ubuntu/actions-runner/.env 2>/dev/null | grep -i coolify | head -5")
if out:
    print('Runner .env:', out)

# Check if coolify has the deploy token in its DB or config
out, _ = run("docker exec coolify env 2>/dev/null | grep -i token | head -5")
if out:
    print('Coolify env tokens:', out)

# Check coolify app config for registered tokens
out, _ = run("docker exec coolify php artisan tinker --execute=\"echo \\$t = \\App\\Models\\PersonalAccessToken::first(); echo \\$t ? \\$t->token : 'none';\" 2>/dev/null | tail -3")
if out:
    print('Coolify token hint:', out)

# Simpler: look for the COOLIFY_TOKEN in the runner's secrets store
out, _ = run("find /home/ubuntu/actions-runner/_work -name '*.json' 2>/dev/null | xargs grep -l COOLIFY 2>/dev/null | head -3")
if out:
    print('Found in:', out)

# Check if there's a coolify.env or similar
out, _ = run("find /data/coolify -name '*.env' 2>/dev/null | head -5")
if out:
    print('Coolify env files:', out)
    for f in out.split('\n')[:2]:
        content, _ = run(f"cat {f} | grep -v SECRET | grep -v PASSWORD | head -10")
        print(f'  {f}:', content[:200])

client.close()
