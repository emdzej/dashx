/**
 * Human-readable descriptions for every signal id, surfaced as a
 * tooltip on the dashboard widget. Kept separate from
 * `SignalDecoder` so the decoder type stays focused on data
 * extraction (and so we can swap to localised text later without
 * touching the per-frame TypeScript files).
 *
 * One line per entry — these go straight into the native `title=""`
 * attribute on widgets, where multi-line text doesn't render well.
 * Lead with the wiki name in parentheses where one exists so users
 * with the MS4X tab open can grep for it.
 */

const DESCRIPTIONS: Record<string, string> = {
  /* DME1 0x316 */
  ENGINE_RPM: "Engine speed (N_ENG). 0x316 B2-B3 LE × 0.15625. ~700 at idle, redline ~6500.",
  TORQUE_REQUESTED: "Indexed torque request (TQI_TQR_CAN, includes ASR/MSR/ETCU/AMT interventions). 0x316 B1 × 0.390625 %.",
  TORQUE_INDICATED: "Indicated torque (TQI_CAN — PVS/N/AMP/TIA/TCO/IGA/PUC based). 0x316 B4 × 0.390625 %.",
  TORQUE_LOSS: "Friction + AC + alternator loss torque (TQ_LOSS_CAN). 0x316 B5 × 0.390625 %.",
  TORQUE_AFTER_CHARGE: "Theoretical post-charge torque from MAF + IGA (TQI_MAF_CAN). MS43 B7 / MS42 B6 × 0.390625 %.",
  ERR_AMT_CAN: "AMT (auto-manual transmission) error state. 2-bit. MS43 B6.6-7 / MS42 B7.0-1.",
  IGNITION_ON: "Terminal 15 / ignition on (LV_SWI_IGK). 0x316 B0.0.",
  CRANK_ERROR: "Crankshaft sensor error (LV_F_N_ENG). 0x316 B0.1.",
  ASC_ACK: "ASC1 received OK by DME within last 500 ms (LV_ACK_TCS). 0x316 B0.2.",
  GEAR_CHANGE_OK: "Gear change permitted (LV_ERR_GC). 0x316 B0.3. 1 = OK to shift.",
  MAF_ERROR: "MAF sensor error (LV_F_SUB_TQI). 0x316 B0.7.",
  CHARGE_INTERVENTION_STATE: "Charge intervention state (SF_TQD, 2-bit). 0=OK, 1=IGA limit, 2=actuators closed, 3=limited dynamics. 0x316 B0.4-5.",

  /* DME2 0x329 */
  MUX_CODE: "Multiplex selector (MUX_CODE) for B0.0-5. 0=CAN_LEVEL, 2=OBD_STEUER, 3=MD_NORM. 0x329 B0.6-7.",
  MUX_INFO: "Multiplex payload (MUX_INFO). 6-bit; meaning depends on MUX_CODE. 0x329 B0.0-5.",
  COOLANT_TEMP: "Coolant temperature (TEMP_ENG). 0x329 B1 × 0.75 − 48 °C. 0xFF = init/no-data.",
  AMBIENT_PRESSURE: "Ambient pressure (AMP_CAN). 0x329 B2 × 2 + 598 hPa. 0xFF = sensor error.",
  PEDAL_POSITION: "Accelerator pedal position (TPS_CAN). 0x329 B5 × 0.390625 % of PVS_MAX.",
  TPS_VIRTUAL: "Virtual cruise TPS (TPS_VIRT_CRU_CAN) — what the cruise control thinks the pedal is. 0x329 B4 × 0.390625 %.",
  CLUTCH_DEPRESSED: "Clutch switch (LV_SWI_CLU). 0x329 B3.0.",
  IDLE_BELOW_THRESH: "Idle regulator below threshold (LV_LEVEL_IS). 0x329 B3.1.",
  ACC1_ACK: "ACC1 (cruise) CAN message acknowledged (LV_ACK_CRU_AD_ECU). 0x329 B3.2.",
  ENGINE_RUNNING: "Engine running (LV_ERU_CAN — true after start). 0x329 B3.3.",
  CRUISE_SWITCH_STATE: "Cruise stalk position (STATE_MSW_CAN, 3-bit). 0=none, 1=set/+, 2=−, 3=resume, 4=I/O, 7=err. 0x329 B3.5-7.",
  BRAKE_ACTUATED: "Brake pedal actuated (LV_BS). 0x329 B6.0.",
  BRAKE_SWITCH_FAULT: "Brake switch system faulty (LV_ERR_BS). 0x329 B6.1.",
  KICKDOWN: "Kickdown active (LV_KD_CAN). 0x329 B6.2.",
  CRUISE_ACTIVE_STATE: "Cruise active state (STATE_CRU_CAN, 3-bit). 0=off, 1=constant, 3=resume, 5=set/accel, 7=decel. 0x329 B6.3-5.",
  CRUISE_ACTIVE: "Cruise control active (any non-zero STATE_CRU_CAN). Convenience boolean.",
  SHIFTLOCK_REQUEST: "Shiftlock request (REQ_SHIFTLOCK, 2-bit). 0=none, 3=ISA/MTC/N_SP_IS active. 0x329 B6.6-7.",

  /* DME4 0x545 */
  LAMP_MIL: "MIL / Check Engine Light (LV_MIL). 0x545 B0.1.",
  LAMP_CRUISE: "Cruise main switch indicator (LV_MAIN_SWI_CRU). 0x545 B0.3.",
  LAMP_EML: "EML — electronic throttle warning (LV_ETC_DIAG). 0x545 B0.4.",
  LAMP_FUEL_CAP: "Fuel tank cap loose / EVAP system warning (LV_FUC_CAN). 0x545 B0.6.",
  LAMP_OIL_CONSUMPTION: "Oil consumption LED. MS43: consumption; MS42: M5-cluster oil-level error. 0x545 B3.0.",
  LAMP_OIL_LOSS: "Oil loss LED. MS43: loss; MS42: oil-level warning. 0x545 B3.1.",
  LAMP_OIL_SENSOR_FAULT: "Oil sensor LED. MS43: sensor fault; MS42: M5 LED. 0x545 B3.2.",
  LAMP_COOLANT_OVERHEAT: "Coolant overheating lamp (LV_TEMP_ENG, c_tco_tmot_sta). 0x545 B3.3.",
  WARMUP_LEDS: "M-Cluster warm-up LED count (0-7). 0x545 B3.4-6.",
  UPSHIFT: "Upshift indicator. MS43-only. 0x545 B3.7.",
  OIL_TEMP: "Oil temperature (TOIL_CAN). MS43-only. 0x545 B4 − 48 °C. Range -48 to 206.",
  LAMP_ALPINA_BATTERY_CHARGE: "Alpina Roadster battery chargelight. 0x545 B5.0. Reads 0 on non-Alpina cars.",
  OIL_LEVEL: "Engine oil level (MSS54HP only — M3 CSL). 0x545 B6 → (raw-158)/10 L.",
  LAMP_TIRE_PRESSURE: "Tire pressure warning (MSS54 only). 0x545 B7.0.",
  LAMP_OIL_PRESSURE_LOW: "Engine oil pressure low. MS43-only. 0x545 B7.7.",
  FUEL_CONSUMPTION_RAW: "Fuel consumption counter (FCO). 0x545 B1-B2 LE. Cluster integrates for instant-fuel display.",

  /* ASC1 0x153 */
  VEHICLE_SPEED: "Vehicle speed (VSS) from DSC. 13-bit B1.3-7+B2 × 0.0625 km/h, with 0x160 raw = 0 km/h offset.",
  BRAKE_LIGHT_SWITCH: "Brake light switch (LV_BLS). 0x153 B0.4.",
  ASC_REQUEST: "ASC intervention requested (LV_ASC_REQ). 0x153 B0.0.",
  MSR_REQUEST: "MSR — engine drag-torque control — requested (LV_MSR_REQ). 0x153 B0.1.",
  ASC_PASSIVE: "ASC passive status, used by EGS (LV_ASC_PASV). 0x153 B0.2.",
  ASC_SWITCH_INFLUENCE: "ASC switching influence (LV_ASC_SW_INT). 0x153 B0.3.",
  BRAKE_ASSIST: "Brake Assist active (LV_BAS). 0x153 B0.5.",
  EBV_ACTIVE: "Electronic Brake-force distribution active (LV_EBV). 0x153 B0.6.",
  LAMP_ABS: "ABS warning lamp (LV_ABS_LED). 0x153 B0.7.",
  ASC_TORQUE: "ASC torque reduction (MD_IND_ASC). 0x153 B3 × 0.390625. 0xFF = no reduction.",
  ASC_TORQUE_LM: "ASC LM torque intervention (MD_IND_ASC_LM). 0x153 B6 × 0.390625 %.",
  MSR_TORQUE: "MSR torque increase (MD_IND_MSR). 0x153 B4 × 0.390625. 0xFF = max increase.",
  ASC_ALIVE: "ASC alive / watchdog counter (0-15). 0x153 B7 lower nibble.",

  /* ASC2 0x1F0 */
  WHEEL_SPEED_1: "Wheel 1 speed (commonly front-left). 0x1F0 B0-B1 LE → (raw−44)/15.875 km/h.",
  WHEEL_SPEED_2: "Wheel 2 speed (commonly front-right). 0x1F0 B2-B3 LE → (raw−44)/15.875 km/h.",
  WHEEL_SPEED_3: "Wheel 3 speed (commonly rear-left). 0x1F0 B4-B5 LE → (raw−44)/15.875 km/h.",
  WHEEL_SPEED_4: "Wheel 4 speed (commonly rear-right). 0x1F0 B6-B7 LE → (raw−44)/15.875 km/h.",

  /* ASC3 0x1F3 */
  ACCEL_X_RAW: "Longitudinal acceleration raw (AX_REF, signed 10-bit). 0x1F3 B3 + B4.0-1. No scale documented.",
  ACCEL_Y_RAW: "Lateral acceleration raw (AY_REF, signed 10-bit). 0x1F3 B4.6-7 + B5. No scale documented.",
  DSC_REGULATING: "DSC currently regulating (DSC_REG). 0x1F3 B4.2.",
  STEERING_HBA: "Steering helper / hydraulic brake assist (S_HBA). 0x1F3 B4.3.",

  /* LWS1 0x1F5 */
  STEERING_ANGLE: "Steering wheel angle (ANG_PSTE). 0x1F5 B0-B1 BE signed × 0.04394°. + = counterclockwise.",
  STEERING_VELOCITY: "Steering wheel angular velocity (VEL_ANG_PSTE). 0x1F5 B2-B3 BE signed × 0.04394 °/s.",
  STEERING_SENSOR_ID: "Steering sensor zero-set ID (PSTE_ID). 0x1F5 B4.",
  STEERING_SENSOR_STATUS: "Steering sensor internal status (PSTE_STATUS, 4-bit). 0x1F5 B5.0-3.",
  STEERING_ALIVE: "Steering sensor alive counter (PSTE_CNT, 4-bit). 0x1F5 B5.4-7.",

  /* ASC4 0x1F8 */
  BRAKE_PRESSURE: "Brake circuit pressure (P_BRAKE). 0x1F8 B2 × 1 bar. Range 0-255.",
  WHEEL_ACCEL: "Wheel acceleration sum (S_WHEEL_ACC). 0x1F8 B0 raw.",
  HDC_STATE: "Hill Descent Control state (S_HDC, 3-bit). 0=off, 1=wrong gear, 2=not low range, 3=overspeed, 4=temp inactive, 5=enabled, 6=active.",
  HDC_ENABLED: "Hill Descent Control enabled (L_HDC). 0x1F8 B1.3.",
  TRAILER_MSR: "Trailer-mode MSR (B_TW_MSR). 0x1F8 B1.5.",
  TRAILER_ASC: "Trailer-mode ASC (B_TW_ASC). 0x1F8 B1.6.",
  OFFROAD_MODE: "Off-road mode (B_Offroad). 0x1F8 B1.7.",

  /* EGS1 0x43F (auto transmission) */
  TRANS_GEAR: "Active gear (GEAR_INFO, 3-bit). 0=N, 1-6=gears, 7=R. 0x43F B0.0-2.",
  TRANS_SHIFTING: "Gear shift currently in progress (LV_GS). 0x43F B0.3.",
  TRANS_OBD_DTC: "TCU OBD-relevant DTC active (OBD_F). 0x43F B0.4.",
  GEARBOX_PROTECTION: "Gearbox protection active (LV_GP_CAN) — triggers speed limit. 0x43F B0.5.",
  CONVERTER_CLUTCH_STATE: "Converter lockup state (STATE_CC, 2-bit). 0=disengaged, 1=regulated, 2=closed. 0x43F B0.6-7.",
  GEAR_LEVER: "Gear lever display position (GEAR_SEL_DISP, 4-bit). 0=clear, 1-4=1st-4th, 5=D, 6=N, 7=R, 8=P, 9=5th, 10=6th. 0x43F B1.0-3.",
  TCU_OBD_STATE: "TCU OBD state (STATE_ETCU_OBD, 4-bit). 0/2=MIL off, 4/6=MIL on, 8/A=MIL FLL, C=idle, E=init, F=invalid. 0x43F B1.4-7.",
  GEARBOX_MODE: "Gearbox mode display (PRG_INF_ANZ, 3-bit). 0=E(con), 1=M(an), 2=S(port), 4=A(uto). 0x43F B2.5-7.",
  TCU_TORQUE_REQUEST: "TCU torque request (TQI_ETCU_CAN). 0x43F B3 × 0.390625 %. 0xFF = no reduction, 0x00 = full.",
  OUTPUT_SHAFT_RAW: "Transmission output shaft speed (N_ABTR). 0x43F B4. No scale documented.",
  TORQUE_CONVERTER_RAW: "Torque converter snapshot (TQ_CONV_CAN). 0x43F B7 raw.",

  /* ICL2 0x613 */
  ODOMETER: "Odometer reading (KM_CTR_CAN). 0x613 B0-B1 LE × 10 km.",
  FUEL_LEVEL: "Fuel tank level (FTL_CAN). 0x613 B2.0-6 (7-bit raw). Cluster-units.",
  FUEL_RESERVE: "Fuel reserve switch (FTL_RES_CAN). 0x613 B2.7. Indicates tank below reserve threshold.",
  RUNNING_CLOCK_MIN: "Running clock since power-on (T_REL_CAN). 0x613 B3-B4 LE → minutes.",
  FUEL_LEVEL_DRIVER: "Driver-side fuel sender (FTL_CAN_L). 0x613 B5.0-5 (6-bit raw).",

  /* ICL3 0x615 */
  AC_TORQUE_OFFSET: "AC compressor torque offset (TQ_ACCIN_CAN, 5-bit). 0x615 B0.0-4 → 0-31 Nm.",
  REQ_LOWER_COOLANT_TEMP: "Request for lower coolant temp (LV_REQ_TCO_L). 0x615 B0.5.",
  AC_COMPRESSOR: "AC compressor on (LV_ACCIN). 0x615 B0.6.",
  AC_REQUEST: "AC compressor request (LV_ACIN). 0x615 B0.7.",
  HEAT_REQUEST: "Increased heat request (LV_REQ_HEAT). 0x615 B1.0.",
  TRAILER_MODE: "Trailer operation mode (LV_TOW). 0x615 B1.1.",
  NIGHT_LIGHTING: "Day/night lighting state (LV_LGT). 0=day, 1=night. 0x615 B1.2.",
  HOOD_SWITCH: "Hood / bonnet switch (LV_HS). 0x615 B1.3.",
  COOLING_FAN_LEVEL: "Electric cooling fan level (N_ECF, 4-bit). 0-15. 0x615 B1.4-7.",
  RAISED_IDLE: "Request raised idle. 0x615 B2.6.",
  AMBIENT_TEMP_RAW: "Ambient temperature raw (TAM_CAN). 0x615 B3. Cluster maps to °C via non-linear table.",
  DOOR: "Door open switch (LV_DOOR). 0x615 B4.0.",
  HANDBRAKE: "Handbrake switch (LV_HBR). 0x615 B4.1.",
  SUSPENSION: "Suspension switch (LV_SUSP, 2-bit). 0x615 B4.2-3.",
  DISPLAYED_SPEED_RAW: "Displayed vehicle speed raw (VSS_DIS, 10-bit). 0x615 B5.6-7 + B6. No formula documented — prefer 0x153 VEHICLE_SPEED.",
};

/** Return the human description for a signal id, or `undefined`. */
export function describeSignal(id: string): string | undefined {
  return DESCRIPTIONS[id];
}
