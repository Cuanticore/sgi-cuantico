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

key = ppk_to_rsakey('srv-cert-front-cuantaia.ppk')
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('98.83.132.206', username='ubuntu', pkey=key, timeout=15)

def run(cmd, timeout=30):
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

print("=== CONTENEDORES ACTIVOS ===")
out, _ = run("docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'")
print(out)

print("\n=== TODOS LOS CONTENEDORES ===")
out, _ = run("docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'")
print(out)

print("\n=== PUERTOS ESCUCHANDO ===")
out, _ = run("ss -tlnp")
print(out)

print("\n=== NGINX EN HOST ===")
out, err = run("systemctl is-active nginx 2>&1 && nginx -t 2>&1")
print(out or err)

print("\n=== NGINX CONFIG ===")
out, _ = run("ls /etc/nginx/sites-enabled/ 2>/dev/null || echo 'no existe'")
print(out)

print("\n=== CADDY ===")
out, _ = run("systemctl is-active caddy 2>/dev/null || echo 'caddy no activo'")
print(out)
out, _ = run("cat /etc/caddy/Caddyfile 2>/dev/null || echo 'sin Caddyfile'")
print(out)

print("\n=== TRAEFIK ===")
out, _ = run("docker ps --filter name=traefik --format '{{.Names}} {{.Status}} {{.Ports}}'")
print(out or "traefik no corre")

print("\n=== CERTBOT CERTIFICADOS ===")
out, err = run("certbot certificates 2>&1")
print(out or err)

print("\n=== /etc/letsencrypt/live/ ===")
out, _ = run("ls /etc/letsencrypt/live/ 2>/dev/null || echo 'no existe'")
print(out)

print("\n=== DOCKER COMPOSE FILES ===")
out, _ = run("find /home/ubuntu /opt /srv -name 'docker-compose*' -o -name 'compose.yml' 2>/dev/null")
print(out or "ninguno encontrado")

print("\n=== ARCHIVOS /home/ubuntu/ ===")
out, _ = run("ls -la /home/ubuntu/")
print(out)

print("\n=== DOCKER VOLUMES ===")
out, _ = run("docker volume ls")
print(out)

client.close()
