<script lang="ts">
  /**
   * E46 PT-CAN dashboard — every signal decoded by the active
   * profile gets a widget. Widgets are grouped by source ECU so a
   * reader can scan one block (DME / ASC-DSC / IKE / EGS / steering)
   * at a time.
   *
   * Layout strategy: hero row is the two primary gauges (RPM +
   * Coolant) and the most-asked-for numeric (vehicle speed). Below,
   * one section per source ECU mixing BarWidget (continuous) +
   * ValueWidget (raw counts) + LampWidget (booleans).
   *
   * Lamp colour convention:
   *   `danger` (BMW M-red) = MIL / overheat / brake actively pressed
   *   `warn`   (amber)     = EML / fuel reserve / sensor faults
   *   `info`   (emerald)   = ignition / cruise / AC / lighting
   */
  import { app } from "../lib/state.svelte";
  import { describeSignal } from "@emdzej/dashx-vehicles";
  import { PID_CATALOG, findPidById, type Obd2Pid } from "@emdzej/dashx-can-obd2";
  import {
    GaugeWidget,
    BarWidget,
    LampWidget,
    ValueWidget,
  } from "@emdzej/dashx-widgets";

  /* Tooltip helper — looks up the wiki-cited description for a
     signal id from the descriptions table in `@emdzej/dashx-vehicles`.
     Returns `undefined` for ids without a description, which makes
     the widget's `title` attribute absent (no hover tooltip). */
  const t = (id: string): string | undefined => describeSignal(id);

  /* OBD-II PIDs in the user's configured poll set. Each becomes a
     ValueWidget; metadata (label, unit, description) is read from
     the PID catalog so adding/removing PIDs only edits config. */
  const obd2Pids = $derived.by((): Obd2Pid[] => {
    return app.config.obd2.pids
      .map((id) => findPidById(id))
      .filter((p): p is Obd2Pid => p !== undefined);
  });

  /* Track which OBD-II PIDs are returning data — surfaces a hint
     on the section header so the user can see whether anything is
     polling. Recomputed every state mutation; cheap. */
  const obd2HasData = $derived(Object.keys(app.obd2).length > 0);
  /* All known PIDs (for the "any decoded response" debug section). */
  const allKnownPids = PID_CATALOG;

  function obd2Value(pid: Obd2Pid): number | null {
    const v = app.obd2[pid.id];
    return typeof v === "number" ? v : null;
  }

  /* Each $derived isolates one signal so the widget only re-renders
     when its value changes. */

  /* DME1 0x316 */
  const rpm = $derived(asNumber(app.signals.ENGINE_RPM));
  const torqueReq = $derived(asNumber(app.signals.TORQUE_REQUESTED));
  const torqueInd = $derived(asNumber(app.signals.TORQUE_INDICATED));
  const torqueLoss = $derived(asNumber(app.signals.TORQUE_LOSS));
  const torqueAc = $derived(asNumber(app.signals.TORQUE_AFTER_CHARGE));
  const chgInt = $derived(asNumber(app.signals.CHARGE_INTERVENTION_STATE));
  const amtErr = $derived(asNumber(app.signals.ERR_AMT_CAN));
  const ignition = $derived(asBool(app.signals.IGNITION_ON));
  const crankErr = $derived(asBool(app.signals.CRANK_ERROR));
  const ascAck = $derived(asBool(app.signals.ASC_ACK));
  const gearChg = $derived(asBool(app.signals.GEAR_CHANGE_OK));
  const mafErr = $derived(asBool(app.signals.MAF_ERROR));

  /* DME2 0x329 */
  const muxCode = $derived(asNumber(app.signals.MUX_CODE));
  const muxInfo = $derived(asNumber(app.signals.MUX_INFO));
  const coolant = $derived(asNumber(app.signals.COOLANT_TEMP));
  const pressure = $derived(asNumber(app.signals.AMBIENT_PRESSURE));
  const pedal = $derived(asNumber(app.signals.PEDAL_POSITION));
  const tpsVirt = $derived(asNumber(app.signals.TPS_VIRTUAL));
  const cruSw = $derived(asNumber(app.signals.CRUISE_SWITCH_STATE));
  const cruState = $derived(asNumber(app.signals.CRUISE_ACTIVE_STATE));
  const shiftlock = $derived(asNumber(app.signals.SHIFTLOCK_REQUEST));
  const running = $derived(asBool(app.signals.ENGINE_RUNNING));
  const clutch = $derived(asBool(app.signals.CLUTCH_DEPRESSED));
  const idleLow = $derived(asBool(app.signals.IDLE_BELOW_THRESH));
  const accAck = $derived(asBool(app.signals.ACC1_ACK));
  const brake = $derived(asBool(app.signals.BRAKE_ACTUATED));
  const brakeErr = $derived(asBool(app.signals.BRAKE_SWITCH_FAULT));
  const kickdown = $derived(asBool(app.signals.KICKDOWN));
  const cruActive = $derived(asBool(app.signals.CRUISE_ACTIVE));

  /* DME4 0x545 */
  const oilT = $derived(asNumber(app.signals.OIL_TEMP));
  const oilLevel = $derived(asNumber(app.signals.OIL_LEVEL));
  const fcoRaw = $derived(asNumber(app.signals.FUEL_CONSUMPTION_RAW));
  const warmup = $derived(asNumber(app.signals.WARMUP_LEDS));
  const mil = $derived(asBool(app.signals.LAMP_MIL));
  const eml = $derived(asBool(app.signals.LAMP_EML));
  const cruiseL = $derived(asBool(app.signals.LAMP_CRUISE));
  const fuelCap = $derived(asBool(app.signals.LAMP_FUEL_CAP));
  const oilCons = $derived(asBool(app.signals.LAMP_OIL_CONSUMPTION));
  const oilLoss = $derived(asBool(app.signals.LAMP_OIL_LOSS));
  const oilSens = $derived(asBool(app.signals.LAMP_OIL_SENSOR_FAULT));
  const overheat = $derived(asBool(app.signals.LAMP_COOLANT_OVERHEAT));
  const upshift = $derived(asBool(app.signals.UPSHIFT));
  const tireP = $derived(asBool(app.signals.LAMP_TIRE_PRESSURE));
  const oilPLow = $derived(asBool(app.signals.LAMP_OIL_PRESSURE_LOW));
  const alpinaBatt = $derived(asBool(app.signals.LAMP_ALPINA_BATTERY_CHARGE));

  /* ASC1 0x153 */
  const speed = $derived(asNumber(app.signals.VEHICLE_SPEED));
  const ascTq = $derived(asNumber(app.signals.ASC_TORQUE));
  const ascTqLm = $derived(asNumber(app.signals.ASC_TORQUE_LM));
  const msrTq = $derived(asNumber(app.signals.MSR_TORQUE));
  const ascAlive = $derived(asNumber(app.signals.ASC_ALIVE));
  const brakeLt = $derived(asBool(app.signals.BRAKE_LIGHT_SWITCH));
  const ascReq = $derived(asBool(app.signals.ASC_REQUEST));
  const msrReq = $derived(asBool(app.signals.MSR_REQUEST));
  const ascPasv = $derived(asBool(app.signals.ASC_PASSIVE));
  const ascSwInf = $derived(asBool(app.signals.ASC_SWITCH_INFLUENCE));
  const bas = $derived(asBool(app.signals.BRAKE_ASSIST));
  const ebv = $derived(asBool(app.signals.EBV_ACTIVE));
  const absL = $derived(asBool(app.signals.LAMP_ABS));

  /* ASC2 0x1F0 wheel speeds */
  const w1 = $derived(asNumber(app.signals.WHEEL_SPEED_1));
  const w2 = $derived(asNumber(app.signals.WHEEL_SPEED_2));
  const w3 = $derived(asNumber(app.signals.WHEEL_SPEED_3));
  const w4 = $derived(asNumber(app.signals.WHEEL_SPEED_4));

  /* ASC3 0x1F3 */
  const ax = $derived(asNumber(app.signals.ACCEL_X_RAW));
  const ay = $derived(asNumber(app.signals.ACCEL_Y_RAW));
  const dscReg = $derived(asBool(app.signals.DSC_REGULATING));
  const hba = $derived(asBool(app.signals.STEERING_HBA));

  /* LWS1 0x1F5 steering */
  const steerAngle = $derived(asNumber(app.signals.STEERING_ANGLE));
  const steerVel = $derived(asNumber(app.signals.STEERING_VELOCITY));
  const steerSt = $derived(asNumber(app.signals.STEERING_SENSOR_STATUS));
  const steerId = $derived(asNumber(app.signals.STEERING_SENSOR_ID));
  const steerAlive = $derived(asNumber(app.signals.STEERING_ALIVE));

  /* ASC4 0x1F8 */
  const brakeP = $derived(asNumber(app.signals.BRAKE_PRESSURE));
  const wheelAcc = $derived(asNumber(app.signals.WHEEL_ACCEL));
  const hdc = $derived(asNumber(app.signals.HDC_STATE));
  const hdcEn = $derived(asBool(app.signals.HDC_ENABLED));
  const trailMsr = $derived(asBool(app.signals.TRAILER_MSR));
  const trailAsc = $derived(asBool(app.signals.TRAILER_ASC));
  const offroad = $derived(asBool(app.signals.OFFROAD_MODE));

  /* EGS1 0x43F automatic transmission */
  const transGear = $derived(asNumber(app.signals.TRANS_GEAR));
  const lever = $derived(asNumber(app.signals.GEAR_LEVER));
  const trMode = $derived(asNumber(app.signals.GEARBOX_MODE));
  const tcuObd = $derived(asNumber(app.signals.TCU_OBD_STATE));
  const convClu = $derived(asNumber(app.signals.CONVERTER_CLUTCH_STATE));
  const tcuTq = $derived(asNumber(app.signals.TCU_TORQUE_REQUEST));
  const outShaft = $derived(asNumber(app.signals.OUTPUT_SHAFT_RAW));
  const convTq = $derived(asNumber(app.signals.TORQUE_CONVERTER_RAW));
  const shifting = $derived(asBool(app.signals.TRANS_SHIFTING));
  const obdDtc = $derived(asBool(app.signals.TRANS_OBD_DTC));
  const boxProt = $derived(asBool(app.signals.GEARBOX_PROTECTION));

  /* ICL2 0x613 */
  const odo = $derived(asNumber(app.signals.ODOMETER));
  const fuel = $derived(asNumber(app.signals.FUEL_LEVEL));
  const fuelL = $derived(asNumber(app.signals.FUEL_LEVEL_DRIVER));
  const runMin = $derived(asNumber(app.signals.RUNNING_CLOCK_MIN));
  const fuelRes = $derived(asBool(app.signals.FUEL_RESERVE));

  /* ICL3 0x615 */
  const acTq = $derived(asNumber(app.signals.AC_TORQUE_OFFSET));
  const fan = $derived(asNumber(app.signals.COOLING_FAN_LEVEL));
  const ambRaw = $derived(asNumber(app.signals.AMBIENT_TEMP_RAW));
  const susp = $derived(asNumber(app.signals.SUSPENSION));
  const dispRaw = $derived(asNumber(app.signals.DISPLAYED_SPEED_RAW));
  const acComp = $derived(asBool(app.signals.AC_COMPRESSOR));
  const acReq = $derived(asBool(app.signals.AC_REQUEST));
  const coolReq = $derived(asBool(app.signals.REQ_LOWER_COOLANT_TEMP));
  const heatReq = $derived(asBool(app.signals.HEAT_REQUEST));
  const trailer = $derived(asBool(app.signals.TRAILER_MODE));
  const night = $derived(asBool(app.signals.NIGHT_LIGHTING));
  const hood = $derived(asBool(app.signals.HOOD_SWITCH));
  const idleHi = $derived(asBool(app.signals.RAISED_IDLE));
  const door = $derived(asBool(app.signals.DOOR));
  const handbrk = $derived(asBool(app.signals.HANDBRAKE));

  function asNumber(v: unknown): number | null {
    return typeof v === "number" ? v : null;
  }
  function asBool(v: unknown): boolean | null {
    return typeof v === "boolean" ? v : null;
  }

</script>

<div class="mx-auto flex max-w-6xl flex-col gap-6 p-4">
  <!-- Hero row: primary gauges + speed + steering -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-4">
    <GaugeWidget label="RPM" unit="" value={rpm} min={0} max={7000} redline={6500} tooltip={t("ENGINE_RPM")} />
    <GaugeWidget label="Coolant" unit="°C" value={coolant} min={-20} max={130} redline={110} tooltip={t("COOLANT_TEMP")} />
    <ValueWidget label="Speed" unit="km/h" value={speed} fractionDigits={0} tooltip={t("VEHICLE_SPEED")} />
    <ValueWidget label="Steering" unit="°" value={steerAngle} fractionDigits={1} tooltip={t("STEERING_ANGLE")} />
  </div>

  <!-- DME — engine + torque + cruise + pedal -->
  <section class="flex flex-col gap-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-faint">
      DME — Engine (0x316 / 0x329)
    </h2>
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <BarWidget label="Pedal" unit="%" value={pedal} min={0} max={100} tooltip={t("PEDAL_POSITION")} />
      <BarWidget label="Torque req" unit="%" value={torqueReq} min={0} max={100} tooltip={t("TORQUE_REQUESTED")} />
      <BarWidget label="Torque ind" unit="%" value={torqueInd} min={0} max={100} tooltip={t("TORQUE_INDICATED")} />
      <BarWidget label="Torque loss" unit="%" value={torqueLoss} min={0} max={100} tooltip={t("TORQUE_LOSS")} />
      <BarWidget label="Torque ac" unit="%" value={torqueAc} min={0} max={100} tooltip={t("TORQUE_AFTER_CHARGE")} />
      <BarWidget label="TPS virt" unit="%" value={tpsVirt} min={0} max={100} tooltip={t("TPS_VIRTUAL")} />
      <ValueWidget label="Pressure" unit="hPa" value={pressure} fractionDigits={0} tooltip={t("AMBIENT_PRESSURE")} />
      <ValueWidget label="Oil" unit="°C" value={oilT} fractionDigits={0} tooltip={t("OIL_TEMP")} />
      <ValueWidget label="Oil lvl" unit="L" value={oilLevel} fractionDigits={1} tooltip={t("OIL_LEVEL")} />
      <ValueWidget label="Chg int" unit="" value={chgInt} fractionDigits={0} tooltip={t("CHARGE_INTERVENTION_STATE")} />
      <ValueWidget label="AMT err" unit="" value={amtErr} fractionDigits={0} tooltip={t("ERR_AMT_CAN")} />
      <ValueWidget label="Mux code" unit="" value={muxCode} fractionDigits={0} tooltip={t("MUX_CODE")} />
      <ValueWidget label="Mux info" unit="" value={muxInfo} fractionDigits={0} tooltip={t("MUX_INFO")} />
      <ValueWidget label="Cru sw" unit="" value={cruSw} fractionDigits={0} tooltip={t("CRUISE_SWITCH_STATE")} />
      <ValueWidget label="Cru state" unit="" value={cruState} fractionDigits={0} tooltip={t("CRUISE_ACTIVE_STATE")} />
      <ValueWidget label="Shiftlock" unit="" value={shiftlock} fractionDigits={0} tooltip={t("SHIFTLOCK_REQUEST")} />
      <ValueWidget label="FCO raw" unit="" value={fcoRaw} fractionDigits={0} tooltip={t("FUEL_CONSUMPTION_RAW")} />
      <ValueWidget label="Warmup" unit="" value={warmup} fractionDigits={0} tooltip={t("WARMUP_LEDS")} />
    </div>
    <div class="flex flex-wrap gap-2">
      <LampWidget label="Ignition" value={ignition} variant="info" tooltip={t("IGNITION_ON")} />
      <LampWidget label="Running" value={running} variant="info" tooltip={t("ENGINE_RUNNING")} />
      <LampWidget label="Cruise" value={cruActive} variant="info" tooltip={t("CRUISE_ACTIVE")} />
      <LampWidget label="Clutch" value={clutch} variant="info" tooltip={t("CLUTCH_DEPRESSED")} />
      <LampWidget label="Brake" value={brake} variant="danger" tooltip={t("BRAKE_ACTUATED")} />
      <LampWidget label="Kickdown" value={kickdown} variant="info" tooltip={t("KICKDOWN")} />
      <LampWidget label="Idle low" value={idleLow} variant="info" tooltip={t("IDLE_BELOW_THRESH")} />
      <LampWidget label="ACC ack" value={accAck} variant="info" tooltip={t("ACC1_ACK")} />
      <LampWidget label="ASC ack" value={ascAck} variant="info" tooltip={t("ASC_ACK")} />
      <LampWidget label="Gear chg" value={gearChg} variant="info" tooltip={t("GEAR_CHANGE_OK")} />
      <LampWidget label="Crank err" value={crankErr} variant="danger" tooltip={t("CRANK_ERROR")} />
      <LampWidget label="MAF err" value={mafErr} variant="danger" tooltip={t("MAF_ERROR")} />
      <LampWidget label="Brake sw err" value={brakeErr} variant="warn" tooltip={t("BRAKE_SWITCH_FAULT")} />
    </div>
  </section>

  <!-- DME — cluster lamps + warm-up -->
  <section class="flex flex-col gap-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-faint">
      DME — Cluster Lamps (0x545)
    </h2>
    <div class="flex flex-wrap gap-2">
      <LampWidget label="MIL" value={mil} variant="danger" tooltip={t("LAMP_MIL")} />
      <LampWidget label="EML" value={eml} variant="warn" tooltip={t("LAMP_EML")} />
      <LampWidget label="Cruise lamp" value={cruiseL} variant="info" tooltip={t("LAMP_CRUISE")} />
      <LampWidget label="Fuel cap" value={fuelCap} variant="warn" tooltip={t("LAMP_FUEL_CAP")} />
      <LampWidget label="Overheat" value={overheat} variant="danger" tooltip={t("LAMP_COOLANT_OVERHEAT")} />
      <LampWidget label="Oil cons" value={oilCons} variant="warn" tooltip={t("LAMP_OIL_CONSUMPTION")} />
      <LampWidget label="Oil loss" value={oilLoss} variant="warn" tooltip={t("LAMP_OIL_LOSS")} />
      <LampWidget label="Oil sens" value={oilSens} variant="warn" tooltip={t("LAMP_OIL_SENSOR_FAULT")} />
      <LampWidget label="Oil press" value={oilPLow} variant="danger" tooltip={t("LAMP_OIL_PRESSURE_LOW")} />
      <LampWidget label="Tire" value={tireP} variant="warn" tooltip={t("LAMP_TIRE_PRESSURE")} />
      <LampWidget label="Upshift" value={upshift} variant="info" tooltip={t("UPSHIFT")} />
      <LampWidget label="Alpina batt" value={alpinaBatt} variant="warn" tooltip={t("LAMP_ALPINA_BATTERY_CHARGE")} />
    </div>
  </section>

  <!-- ASC / DSC -->
  <section class="flex flex-col gap-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-faint">
      ASC / DSC (0x153 / 0x1F0 / 0x1F3 / 0x1F8)
    </h2>
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <ValueWidget label="W1" unit="km/h" value={w1} fractionDigits={1} tooltip={t("WHEEL_SPEED_1")} />
      <ValueWidget label="W2" unit="km/h" value={w2} fractionDigits={1} tooltip={t("WHEEL_SPEED_2")} />
      <ValueWidget label="W3" unit="km/h" value={w3} fractionDigits={1} tooltip={t("WHEEL_SPEED_3")} />
      <ValueWidget label="W4" unit="km/h" value={w4} fractionDigits={1} tooltip={t("WHEEL_SPEED_4")} />
      <BarWidget label="Brake P" unit="bar" value={brakeP} min={0} max={255} tooltip={t("BRAKE_PRESSURE")} />
      <BarWidget label="ASC tq" unit="%" value={ascTq} min={0} max={100} tooltip={t("ASC_TORQUE")} />
      <BarWidget label="ASC tq LM" unit="%" value={ascTqLm} min={0} max={100} tooltip={t("ASC_TORQUE_LM")} />
      <BarWidget label="MSR tq" unit="%" value={msrTq} min={0} max={100} tooltip={t("MSR_TORQUE")} />
      <ValueWidget label="Accel X" unit="" value={ax} fractionDigits={0} tooltip={t("ACCEL_X_RAW")} />
      <ValueWidget label="Accel Y" unit="" value={ay} fractionDigits={0} tooltip={t("ACCEL_Y_RAW")} />
      <ValueWidget label="Wheel acc" unit="" value={wheelAcc} fractionDigits={0} tooltip={t("WHEEL_ACCEL")} />
      <ValueWidget label="HDC" unit="" value={hdc} fractionDigits={0} tooltip={t("HDC_STATE")} />
      <ValueWidget label="ASC ✓" unit="" value={ascAlive} fractionDigits={0} tooltip={t("ASC_ALIVE")} />
    </div>
    <div class="flex flex-wrap gap-2">
      <LampWidget label="Brake lt" value={brakeLt} variant="danger" tooltip={t("BRAKE_LIGHT_SWITCH")} />
      <LampWidget label="ASC req" value={ascReq} variant="warn" tooltip={t("ASC_REQUEST")} />
      <LampWidget label="MSR req" value={msrReq} variant="warn" tooltip={t("MSR_REQUEST")} />
      <LampWidget label="ASC pasv" value={ascPasv} variant="info" tooltip={t("ASC_PASSIVE")} />
      <LampWidget label="ASC sw" value={ascSwInf} variant="info" tooltip={t("ASC_SWITCH_INFLUENCE")} />
      <LampWidget label="BAS" value={bas} variant="warn" tooltip={t("BRAKE_ASSIST")} />
      <LampWidget label="EBV" value={ebv} variant="info" tooltip={t("EBV_ACTIVE")} />
      <LampWidget label="ABS" value={absL} variant="danger" tooltip={t("LAMP_ABS")} />
      <LampWidget label="DSC reg" value={dscReg} variant="warn" tooltip={t("DSC_REGULATING")} />
      <LampWidget label="HBA" value={hba} variant="info" tooltip={t("STEERING_HBA")} />
      <LampWidget label="HDC en" value={hdcEn} variant="info" tooltip={t("HDC_ENABLED")} />
      <LampWidget label="Trail MSR" value={trailMsr} variant="info" tooltip={t("TRAILER_MSR")} />
      <LampWidget label="Trail ASC" value={trailAsc} variant="info" tooltip={t("TRAILER_ASC")} />
      <LampWidget label="Offroad" value={offroad} variant="info" tooltip={t("OFFROAD_MODE")} />
    </div>
  </section>

  <!-- Steering -->
  <section class="flex flex-col gap-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-faint">
      Steering (0x1F5)
    </h2>
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <ValueWidget label="Steer ω" unit="°/s" value={steerVel} fractionDigits={1} tooltip={t("STEERING_VELOCITY")} />
      <ValueWidget label="Sensor ID" unit="" value={steerId} fractionDigits={0} tooltip={t("STEERING_SENSOR_ID")} />
      <ValueWidget label="Sensor st" unit="" value={steerSt} fractionDigits={0} tooltip={t("STEERING_SENSOR_STATUS")} />
      <ValueWidget label="Steer ✓" unit="" value={steerAlive} fractionDigits={0} tooltip={t("STEERING_ALIVE")} />
    </div>
  </section>

  <!-- EGS / Transmission -->
  <section class="flex flex-col gap-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-faint">
      EGS / Transmission (0x43F)
    </h2>
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <ValueWidget label="Gear" unit="" value={transGear} fractionDigits={0} tooltip={t("TRANS_GEAR")} />
      <ValueWidget label="Lever" unit="" value={lever} fractionDigits={0} tooltip={t("GEAR_LEVER")} />
      <ValueWidget label="Mode" unit="" value={trMode} fractionDigits={0} tooltip={t("GEARBOX_MODE")} />
      <ValueWidget label="Conv clu" unit="" value={convClu} fractionDigits={0} tooltip={t("CONVERTER_CLUTCH_STATE")} />
      <BarWidget label="TCU tq req" unit="%" value={tcuTq} min={0} max={100} tooltip={t("TCU_TORQUE_REQUEST")} />
      <ValueWidget label="Out shaft" unit="" value={outShaft} fractionDigits={0} tooltip={t("OUTPUT_SHAFT_RAW")} />
      <ValueWidget label="Conv tq" unit="" value={convTq} fractionDigits={0} tooltip={t("TORQUE_CONVERTER_RAW")} />
      <ValueWidget label="TCU OBD" unit="" value={tcuObd} fractionDigits={0} tooltip={t("TCU_OBD_STATE")} />
    </div>
    <div class="flex flex-wrap gap-2">
      <LampWidget label="Shifting" value={shifting} variant="info" tooltip={t("TRANS_SHIFTING")} />
      <LampWidget label="TCU DTC" value={obdDtc} variant="warn" tooltip={t("TRANS_OBD_DTC")} />
      <LampWidget label="Box prot" value={boxProt} variant="warn" tooltip={t("GEARBOX_PROTECTION")} />
    </div>
  </section>

  <!-- IKE — odometer + fuel + clock -->
  <section class="flex flex-col gap-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-faint">
      IKE — Cluster (0x613)
    </h2>
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <ValueWidget label="Odo" unit="km" value={odo} fractionDigits={0} tooltip={t("ODOMETER")} />
      <BarWidget label="Fuel" unit="" value={fuel} min={0} max={127} tooltip={t("FUEL_LEVEL")} />
      <BarWidget label="Fuel L" unit="" value={fuelL} min={0} max={63} tooltip={t("FUEL_LEVEL_DRIVER")} />
      <ValueWidget label="Run min" unit="min" value={runMin} fractionDigits={0} tooltip={t("RUNNING_CLOCK_MIN")} />
    </div>
    <div class="flex flex-wrap gap-2">
      <LampWidget label="Reserve" value={fuelRes} variant="warn" tooltip={t("FUEL_RESERVE")} />
    </div>
  </section>

  <!-- IKE — AC + ambient + lighting (ICL3) -->
  <section class="flex flex-col gap-3">
    <h2 class="text-xs font-semibold uppercase tracking-wider text-faint">
      IKE — AC / Body (0x615)
    </h2>
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <ValueWidget label="AC tq" unit="Nm" value={acTq} fractionDigits={0} tooltip={t("AC_TORQUE_OFFSET")} />
      <BarWidget label="Fan" unit="" value={fan} min={0} max={15} tooltip={t("COOLING_FAN_LEVEL")} />
      <ValueWidget label="Amb raw" unit="" value={ambRaw} fractionDigits={0} tooltip={t("AMBIENT_TEMP_RAW")} />
      <ValueWidget label="Susp" unit="" value={susp} fractionDigits={0} tooltip={t("SUSPENSION")} />
      <ValueWidget label="Disp raw" unit="" value={dispRaw} fractionDigits={0} tooltip={t("DISPLAYED_SPEED_RAW")} />
    </div>
    <div class="flex flex-wrap gap-2">
      <LampWidget label="AC req" value={acReq} variant="info" tooltip={t("AC_REQUEST")} />
      <LampWidget label="AC comp" value={acComp} variant="info" tooltip={t("AC_COMPRESSOR")} />
      <LampWidget label="Cool ↓" value={coolReq} variant="info" tooltip={t("REQ_LOWER_COOLANT_TEMP")} />
      <LampWidget label="Heat ↑" value={heatReq} variant="info" tooltip={t("HEAT_REQUEST")} />
      <LampWidget label="Idle ↑" value={idleHi} variant="info" tooltip={t("RAISED_IDLE")} />
      <LampWidget label="Night" value={night} variant="info" tooltip={t("NIGHT_LIGHTING")} />
      <LampWidget label="Hood" value={hood} variant="warn" tooltip={t("HOOD_SWITCH")} />
      <LampWidget label="Door" value={door} variant="info" tooltip={t("DOOR")} />
      <LampWidget label="Hbrake" value={handbrk} variant="info" tooltip={t("HANDBRAKE")} />
      <LampWidget label="Trailer" value={trailer} variant="info" tooltip={t("TRAILER_MODE")} />
    </div>
  </section>

  <!-- OBD-II Mode 01 (diagnostic poll) -->
  <section class="flex flex-col gap-3">
    <h2 class="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-faint">
      <span>OBD-II Mode 01 (0x7DF / 0x7E8)</span>
      {#if app.config.obd2.activePoll}
        <span class="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
          polling @ {app.config.obd2.pollIntervalMs} ms · req
          <span class="font-mono">
            0x{(app.config.obd2.requestId ?? 0x7DF).toString(16).toUpperCase()}
          </span>
        </span>
      {:else if app.config.obd2.passiveSniff}
        <span class="rounded border border-divider px-1.5 py-0.5 text-[10px] text-faint">
          passive
        </span>
      {/if}
      {#if app.status.kind === "connected"}
        <span class="rounded border border-divider px-1.5 py-0.5 font-mono text-[10px] normal-case text-faint">
          tx: <span class="text-foreground">{app.obd2Stats.txCount}</span>
          · rx: <span class="text-foreground">{app.obd2Stats.rxCount}</span>
          {#if app.obd2Stats.timeoutCount > 0}
            · timeouts: <span class="text-amber-500">{app.obd2Stats.timeoutCount}</span>
          {/if}
        </span>
        {#if app.obd2Stats.lastError}
          <span
            class="rounded bg-red-500/10 px-1.5 py-0.5 font-mono text-[10px] normal-case text-red-500"
            title={app.obd2Stats.lastError}
          >
            TX error
          </span>
        {/if}
      {/if}
    </h2>

    {#if !obd2HasData && app.status.kind === "connected"}
      <div class="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted">
        <div class="mb-1 font-semibold text-amber-700 dark:text-amber-300">
          {#if app.obd2Stats.txCount === 0 && app.config.obd2.activePoll}
            Active polling is on but nothing has been transmitted.
          {:else if app.obd2Stats.txCount > 0 && app.obd2Stats.rxCount === 0}
            Transmitting {app.obd2Stats.txCount} requests — no replies from the DME.
          {:else}
            No OBD-II responses yet.
          {/if}
        </div>
        {#if app.obd2Stats.txCount === 0 && app.config.obd2.activePoll}
          <ul class="ml-3 list-disc space-y-0.5 text-faint">
            <li>If you connected with Active poll OFF and just enabled it, the bus is in listen-only mode and TX is dropped silently. <strong>Reconnect</strong> to switch the bus to normal mode.</li>
            <li>SLCAN adapter in M1 (silent) won't transmit. The connect path picks M0 only when Active is on at connect time.</li>
            <li>Look in the Frame log — you should see <code class="font-mono">0x7DF</code> outgoing if TX is working. If you don't, the SLCAN write is being rejected.</li>
          </ul>
        {:else if app.obd2Stats.txCount > 0 && app.obd2Stats.rxCount === 0}
          <ul class="ml-3 list-disc space-y-0.5 text-faint">
            <li>The DME isn't answering. Confirm KL15 is on (key in run position) — some PIDs need engine running but Battery and Coolant work with KL15 alone.</li>
            <li>Early MS43 builds (~2001-2002) may only do K-line OBD-II. From MY2003 onwards CAN-OBD-II is standard.</li>
            <li>Try a direct request id: open Settings, switch active off then on so the poller restarts. Some DMEs are pickier about <code class="font-mono">0x7E0</code> (direct) than <code class="font-mono">0x7DF</code> (broadcast) — broadcast is what DASHX uses today.</li>
            <li>Wiring: PT-CAN-H/L need 60Ω termination across the pair. If your adapter is alone on the bus the termination might be off.</li>
          </ul>
        {:else if !app.config.obd2.activePoll}
          <span class="text-faint">
            Passive sniff only decodes responses someone else has requested. Enable
            <span class="font-medium">Active poll</span> in Settings and reconnect to make DASHX
            send its own 0x7DF requests.
          </span>
        {/if}
      </div>
    {/if}
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      {#each obd2Pids as pid (pid.id)}
        <ValueWidget
          label={pid.label}
          unit={pid.unit}
          value={obd2Value(pid)}
          fractionDigits={pid.unit === "RPM" || pid.unit === "kPa" || pid.unit === "km/h" || pid.unit === "g/s" ? 0 : 2}
          tooltip={pid.description}
        />
      {/each}
    </div>
    {#if app.config.obd2.passiveSniff}
      <details class="text-xs">
        <summary class="cursor-pointer select-none text-faint">
          Sniffed PIDs (any responder)
        </summary>
        <div class="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
          {#each allKnownPids as pid (pid.id)}
            {#if app.obd2[pid.id] !== undefined && !obd2Pids.some((p) => p.id === pid.id)}
              <ValueWidget
                label={pid.label}
                unit={pid.unit}
                value={obd2Value(pid)}
                fractionDigits={2}
                tooltip={pid.description}
              />
            {/if}
          {/each}
        </div>
      </details>
    {/if}
  </section>

</div>
