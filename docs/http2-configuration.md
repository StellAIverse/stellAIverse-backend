# HTTP/2 Configuration Guide

This document explains how to configure HTTP/2 support in the StellAIverse backend.

## Environment Variables

Add the following environment variables to your `.env` file:

```bash
# HTTP/2 Configuration
HTTP2_ENABLED=true                    # Enable HTTP/2 (default: true)
HTTPS_ENABLED=true                     # Enable HTTPS (required for HTTP/2 in production)

# SSL Certificate Paths (required when HTTPS_ENABLED=true)
SSL_KEY_PATH=ssl/private-key.pem      # Path to SSL private key
SSL_CERT_PATH=ssl/certificate.pem      # Path to SSL certificate
SSL_CA_PATH=ssl/ca-bundle.pem         # Optional: Path to CA certificate bundle
```

## Development Setup

For development without SSL certificates, the application will run with HTTP/1.1 but log a warning about HTTP/2 requiring HTTPS.

## Production Setup

### 1. Obtain SSL Certificates

You can obtain SSL certificates from:
- Let's Encrypt (free): `certbot --nginx -d yourdomain.com`
- Commercial CA providers
- Self-signed certificates for internal use

### 2. Place Certificates

Create an `ssl` directory in your project root and place:
- `private-key.pem` - Your SSL private key
- `certificate.pem` - Your SSL certificate
- `ca-bundle.pem` - (Optional) CA certificate bundle

### 3. Configure Environment

Set the environment variables as shown above.

### 4. Restart Application

Restart your application with HTTPS enabled:

```bash
HTTPS_ENABLED=true HTTP2_ENABLED=true npm run start:prod
```

## HTTP/2 Benefits

- **Multiplexing**: Multiple requests can be sent over a single connection
- **Server Push**: Server can proactively send resources to clients
- **Header Compression**: HPACK algorithm reduces header overhead
- **Binary Protocol**: More efficient parsing compared to HTTP/1.1 text
- **Stream Prioritization**: Better resource loading performance

## Performance Monitoring

Monitor HTTP/2 performance using:
- Chrome DevTools Network tab (shows HTTP/2 protocol)
- Server logs showing connection type
- Performance metrics in your monitoring system

## Troubleshooting

### Common Issues

1. **HTTP/2 not working in development**
   - This is expected behavior. HTTP/2 requires HTTPS in production.
   - The application will log a warning and fall back to HTTP/1.1.

2. **SSL certificate errors**
   - Ensure certificate files exist and are readable
   - Check file paths in environment variables
   - Verify certificate validity

3. **Browser compatibility**
   - Modern browsers support HTTP/2 over HTTPS
   - Older browsers will fall back to HTTP/1.1 automatically

### Verification

To verify HTTP/2 is working:

1. Open browser developer tools
2. Go to Network tab
3. Look for "h2" in the Protocol column
4. Check that multiple resources share the same connection

## Security Considerations

- Always use HTTPS with HTTP/2 in production
- Keep SSL certificates updated
- Use strong cipher suites
- Implement proper certificate validation
