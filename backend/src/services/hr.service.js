import dotenv from 'dotenv';

dotenv.config();

const HR_API_BASE = process.env.HR_API_BASE_URL || 'https://hrapps.nestdigital.com:8085';

/**
 * Fetches employee data from Nest Digital's HR REST API.
 * Endpoint: POST /api/employee/GetEmployeeData
 * 
 * @param {object} payload - Request body payload for the HR API
 * @returns {Promise<object>} Employee data returned by the API
 */
export async function fetchEmployeeFromHR(payload) {
  // Bypass internal CA certificate verification issues
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const username = payload.username || payload.email || '';
  const cleanedPayload = { username };

  const url = `${HR_API_BASE}/api/employee/GetEmployeeData`;
  console.log(`📡 [HRService] Requesting external HR API: POST ${url} with payload:`, cleanedPayload);

  try {
    // Note: Since this is an internal Nest Digital endpoint, it might utilize self-signed certs.
    // Node's native fetch respects the global process.env.NODE_TLS_REJECT_UNAUTHORIZED='0' if needed.
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(cleanedPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorJson = {};
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {}
      
      console.error(`❌ [HRService] External HR API returned error status ${response.status}:`, errorJson);
      throw new Error(errorJson.message || errorJson.error || `HR API returned status ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ [HRService] Fetched data successfully:', data);
    return data;
  } catch (error) {
    console.error('❌ [HRService] Error contacting external HR API:', error.message);
    throw error;
  }
}
