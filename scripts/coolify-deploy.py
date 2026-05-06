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

# Find runner user and check all docker configs
out, _ = run("ps aux | grep 'Runner.Listener' | grep -v grep | awk '{print $1}' | head -1")
print('Runner user:', out or 'not found')

out, _ = run("find /home /root /var /opt -name 'config.json' -path '*docker*' 2>/dev/null | xargs grep -l 'ghcr' 2>/dev/null")
print('Docker configs with ghcr:', out or 'none')

# Check if the workflow can be modified to do restart directly
# For now, show what's in the deploy workflow
out, _ = run("cat /home/ubuntu/actions-runner/externals/node20/bin/node 2>/dev/null | head -1 || echo 'runner path differs'")

# Alternative: update the workflow to do direct restart
out, _ = run("ls /home/ubuntu/actions-runner/ 2>/dev/null | head -10")
print('Runner dir:', out)

# Check if there's a credential store that has ghcr token
out, _ = run("find /home/ubuntu -name '*.token' -o -name '*.credentials' 2>/dev/null | head -5")
print('Token files:', out or 'none')

# Last resort: update the workflow file to also do docker restart
# For now, check if we can add GHCR creds to workflow and redeploy
print('\n--- RECOMMENDATION ---')
print('Need to update .github/workflows/deploy.yml to:')
print('1. After "Build and push", do docker pull + docker restart on server')
print('2. OR configure a GitHub PAT in Coolify as registry credential')
print('3. OR make the GHCR package public')

client.close()
