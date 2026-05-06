import paramiko, struct, base64, io, sys
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
        val = int.from_bytes(data[pos+4:pos+4+length], 'big')
        return val, pos + 4 + length

    pub = sections['Public-Lines']
    priv = sections['Private-Lines']

    pos = 4 + struct.unpack('>I', pub[:4])[0]
    e, pos = read_mpint(pub, pos)
    n, pos = read_mpint(pub, pos)

    pos = 0
    d, pos = read_mpint(priv, pos)
    p, pos = read_mpint(priv, pos)
    q, pos = read_mpint(priv, pos)

    pub_n = RSAPublicNumbers(e, n)
    priv_n = RSAPrivateNumbers(p, q, d, rsa_crt_dmp1(d,p), rsa_crt_dmq1(d,q), rsa_crt_iqmp(p,q), pub_n)
    crypto_key = priv_n.private_key()
    pem = crypto_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption()
    )
    return paramiko.RSAKey.from_private_key(io.StringIO(pem.decode()))

key = ppk_to_rsakey(r'c:\Users\danie\Claude\Indicadores\srv-cert-front-cuantaia.ppk')
print('Key loaded OK')

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('98.83.132.206', username='ubuntu', pkey=key, timeout=15)
print('Connected to 98.83.132.206')

commands = [
    "docker ps --format '{{.Names}}\\t{{.Status}}'",
    "docker inspect $(docker ps -q | head -1) 2>/dev/null | python3 -c \"import json,sys; c=json.load(sys.stdin); [print(e) for e in c[0]['Config']['Env'] if 'SHAREPOINT_INDICATORS_FILE' in e]\" 2>/dev/null",
]

for cmd in commands:
    _, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f'\n$ {cmd[:80]}')
    if out: print(out)
    if err: print('ERR:', err[:300])

client.close()
