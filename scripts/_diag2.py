import paramiko, struct, base64, io, json
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

key = ppk_to_rsakey('srv-cert-front-cuantaia.ppk')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('98.83.132.206', username='ubuntu', pkey=key, timeout=15)

def run(cmd, timeout=30):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

APP = 'xkl6pdbfpctlsilc52de07xi-012220753802'

print("=== LABELS DEL CONTENEDOR APP ===")
out, _ = run(f"docker inspect {APP} --format '{{{{json .Config.Labels}}}}'")
try:
    labels = json.loads(out)
    for k, v in sorted(labels.items()):
        print(f"  {k}: {v}")
except:
    print(out)

print("\n=== REDES DEL CONTENEDOR APP ===")
out, _ = run(f"docker inspect {APP} --format '{{{{json .NetworkSettings.Networks}}}}'")
try:
    nets = json.loads(out)
    for name, info in nets.items():
        print(f"  Red: {name} | IP: {info.get('IPAddress','?')}")
except:
    print(out)

print("\n=== DOCKER-COMPOSE DEL PROYECTO ===")
out, _ = run("cat /home/ubuntu/sgi-cuantico/docker-compose.yaml")
print(out)

print("\n=== LOGS RECIENTES CADDY-PROXY ===")
out, _ = run("docker logs coolify-proxy --tail 50 2>&1")
print(out)

print("\n=== LOGS RECIENTES APP (ultimas 30 lineas) ===")
out, _ = run(f"docker logs {APP} --tail 30 2>&1")
print(out)

print("\n=== REDES DEL CADDY-PROXY ===")
out, _ = run("docker inspect coolify-proxy --format '{{json .NetworkSettings.Networks}}'")
try:
    nets = json.loads(out)
    for name in nets:
        print(f"  Red: {name}")
except:
    print(out)

client.close()
