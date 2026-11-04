package jp.nanpure.refill;

import android.net.Network;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

final class RefillApi {
    private static final int TIMEOUT = 15000;
    private final Network network;
    private final String endpoint;

    RefillApi(Network network, String endpoint) {
        this.network = network;
        this.endpoint = endpoint;
    }

    JSONObject call(String token, JSONObject body) throws IOException, JSONException {
        URL url = new URL(endpoint);
        HttpURLConnection connection = (HttpURLConnection) (network == null
                ? url.openConnection() : network.openConnection(url));
        byte[] encoded = body.toString().getBytes(StandardCharsets.UTF_8);
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(TIMEOUT);
            connection.setReadTimeout(TIMEOUT);
            connection.setRequestMethod("POST");
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Accept", "application/json");
            if (!token.isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setDoOutput(true);
            connection.setFixedLengthStreamingMode(encoded.length);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(encoded);
            }
            int code = connection.getResponseCode();
            if (code != 200) {
                try (InputStream in = connection.getErrorStream()) {
                    throw new HttpFailure(code, readError(in));
                }
            }
            try (InputStream in = connection.getInputStream()) {
                JSONObject result = new JSONObject(read(in));
                if (!result.optBoolean("ok")) throw new IOException("Unexpected API response");
                return result;
            }
        } finally {
            connection.disconnect();
        }
    }

    static JSONObject action(String name) throws JSONException {
        return new JSONObject().put("action", name);
    }

    private static String readError(InputStream input) {
        if (input == null) return "";
        try {
            JSONObject json = new JSONObject(read(input));
            return json.optString("code", json.optString("error"));
        } catch (IOException | JSONException ex) {
            return "";
        }
    }

    private static String read(InputStream input) throws IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        int count;
        while ((count = input.read(buffer)) != -1) {
            if (bytes.size() + count > 512 * 1024) throw new IOException("API response too large");
            bytes.write(buffer, 0, count);
        }
        return bytes.toString(StandardCharsets.UTF_8.name());
    }

    static final class HttpFailure extends IOException {
        private static final long serialVersionUID = 1L;
        final int status;
        final String code;

        HttpFailure(int status, String code) {
            super("Refill HTTP " + status);
            this.status = status;
            this.code = code;
        }
    }
}
