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

print("=== LOGS CADDY - errores sig.cuantico.com ===")
out, _ = run("docker logs coolify-proxy 2>&1 | grep -i 'sig.cuantico\\|ambiguous\\|error\\|certificate\\|tls' | tail -40")
print(out)

print("\n=== DOCKER-COMPOSE EN /home/ubuntu/sgi-cuantico/ ===")
out, _ = run("cat /home/ubuntu/sgi-cuantico/docker-compose.yaml 2>/dev/null || echo 'no existe'")
print(out)

print("\n=== CONTENEDORES DEL COMPOSE LOCAL ===")
out, _ = run("cd /home/ubuntu/sgi-cuantico && docker compose ps 2>/dev/null || echo 'no activo'")
print(out)

print("\n=== TODOS LOS CONTENEDORES CON sig.cuantico EN LABELS ===")
out, _ = run("docker ps -a --filter label=caddy_0=https://sig.cuantico.com --format '{{.Names}} {{.Status}}'")
print(out or "ninguno")

print("\n=== CERTIFICADOS EN CADDY STORAGE ===")
out, _ = run("docker exec coolify-proxy find /data/caddy -name '*.json' 2>/dev/null | grep -i 'sig\\|cuantico' | head -10")
print(out or "no encontrado")

print("\n=== CADDY CONFIG ACTUAL (endpoint admin) ===")
out, _ = run("docker exec coolify-proxy wget -qO- http://localhost:2019/config/ 2>/dev/null | python3 -m json.tool 2>/dev/null | grep -A5 'sig.cuantico' | head -30")
print(out or "no disponible")

print("\n=== TEST SSL DESDE EL SERVIDOR ===")
out, err = run("curl -v --max-time 10 https://sig.cuantico.com 2>&1 | grep -E 'SSL|TLS|certificate|expire|error|issuer|subject|Connected' | head -20")
print(out or err)

print("\n=== GITHUB WORKFLOW ACTUAL ===")
out, _ = run("cat /home/ubuntu/sgi-cuantico/../actions-runner/_work/sgi-cuantico/sgi-cuantico/.github/workflows/deploy.yml 2>/dev/null || echo 'no encontrado aqui'")
print(out)

print("\n=== CADDY STORAGE CERT PARA sig.cuantico.com ===")
out, _ = run("docker exec coolify-proxy ls /data/caddy/certificates/ 2>/dev/null")
print(out or "no disponible")

client.close()
