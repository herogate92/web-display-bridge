using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;

internal static class Program
{
    static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, IncludeFields = true };
    const uint Attached = 1, Primary = 4, Mirror = 8;
    const uint Position = 0x20, Orientation = 0x80, Bits = 0x40000, Width = 0x80000, Height = 0x100000, Frequency = 0x400000;
    record Bounds(int X, int Y, int Width, int Height);
    record Mode(int Width, int Height, int Frequency);
    record Display(string Identity, string Name, string Description, bool Virtual, bool Active, bool Primary, Bounds Bounds, int Frequency, Mode[] Modes);
    record Snapshot(int Version, string Identity, bool WasActive, DevMode Before, DevMode Applied);
    static void Main(string[] args)
    {
        SetProcessDpiAwarenessContext(new IntPtr(-4));
        try
        {
            object result = args[0] switch
            {
                "list" => List(),
                "activate" => CcdDiagnostic.Activate(Resolve(List(), args[1]).Identity, int.Parse(args[2]), int.Parse(args[3]), int.Parse(args[4]), args[5]),
                "restore" => RestoreAuto(args[1]),
                "selftest" => SelfTest(),
                "probe" => Probe(),
                "ccd-validate" => CcdDiagnostic.ValidateMode(Resolve(List(), args[1]).Identity, int.Parse(args[2]), int.Parse(args[3]), int.Parse(args[4]), args[5]),
                "deactivate" => CcdDiagnostic.Deactivate(Resolve(List(), args[1]).Identity),
                "ccd-diagnose" => CcdDiagnostic.Run(Resolve(List(), args[1]).Identity, args[2], true),
                "ccd-restore" => CcdDiagnostic.Restore(args[1]),
                _ => throw new Exception("Unknown command")
            };
            Console.WriteLine(JsonSerializer.Serialize(result, Json));
        }
        catch (Exception e) { Console.WriteLine(JsonSerializer.Serialize(new { error = e.Message }, Json)); }
    }
    static Display[] List()
    {
        var result = new List<Display>();
        for (uint i = 0; ; i++)
        {
            var d = Device.New();
            if (!EnumDisplayDevices(null, i, ref d, 0)) break;
            if ((d.StateFlags & Mirror) != 0) continue;
            var monitor = Device.New();
            EnumDisplayDevices(d.DeviceName, 0, ref monitor, 1);
            var identity = !string.IsNullOrWhiteSpace(monitor.DeviceID) ? monitor.DeviceID : d.DeviceID;
            if (string.IsNullOrWhiteSpace(identity)) continue;
            var description = d.DeviceString + " / " + monitor.DeviceString;
            bool isVirtual = Regex.IsMatch(d.DeviceString, @"^(Virtual Display Driver|IddSampleDriver|Virtual Desktop Monitor)$", RegexOptions.IgnoreCase);
            var current = DevMode.New();
            if (!EnumDisplaySettingsEx(d.DeviceName, -1, ref current, 0)) EnumDisplaySettingsEx(d.DeviceName, -2, ref current, 0);
            var modes = new List<Mode>();
            for (int m = 0; m < 10000; m++)
            {
                var dm = DevMode.New();
                if (!EnumDisplaySettingsEx(d.DeviceName, m, ref dm, 0)) break;
                modes.Add(new((int)dm.dmPelsWidth, (int)dm.dmPelsHeight, (int)dm.dmDisplayFrequency));
            }
            result.Add(new(identity, d.DeviceName, description, isVirtual, (d.StateFlags & Attached) != 0,
                (d.StateFlags & Primary) != 0, new(current.dmPositionX, current.dmPositionY, (int)current.dmPelsWidth, (int)current.dmPelsHeight),
                (int)current.dmDisplayFrequency, modes.Distinct().ToArray()));
        }
        return result.ToArray();
    }
    static Display Resolve(Display[] displays, string identity)
    {
        var found = displays.Where(d => d.Identity == identity && d.Virtual && !d.Primary).ToArray();
        if (found.Length != 1) throw new Exception("가상 모니터의 장치 식별자가 없거나 중복되었습니다. 기본 화면은 변경하지 않습니다.");
        return found[0];
    }
    static object Probe()
    {
        var all = List(); var results = new List<object>();
        foreach (var physical in all.Where(d => d.Active && !d.Virtual))
        {
            var unchanged = DevMode.New();
            if (EnumDisplaySettingsEx(physical.Name, -1, ref unchanged, 0))
                results.Add(new { physical.Name, control = true, testCode = ChangeDisplaySettingsEx(physical.Name, ref unchanged, IntPtr.Zero, 2, IntPtr.Zero) });
        }
        foreach (var target in all.Where(d => d.Virtual && !d.Primary))
        {
            var rightmost = all.Where(d => d.Active && d.Identity != target.Identity).OrderByDescending(d => d.Bounds.X + d.Bounds.Width).First();
            for (int i = 0; i < 10000; i++)
            {
                var mode = DevMode.New();
                if (!EnumDisplaySettingsEx(target.Name, i, ref mode, 0)) break;
                if (mode.dmDisplayFrequency != 60 || mode.dmBitsPerPel != 32 || !(mode.dmPelsWidth == 800 || mode.dmPelsWidth == 1920)) continue;
                mode.dmPositionX = rightmost.Bounds.X + rightmost.Bounds.Width; mode.dmPositionY = rightmost.Bounds.Y;
                mode.dmFields = Position | Width | Height | Bits | Frequency | Orientation;
                int code = ChangeDisplaySettingsEx(target.Name, ref mode, IntPtr.Zero, 2, IntPtr.Zero);
                results.Add(new { target.Identity, target.Name, width = mode.dmPelsWidth, height = mode.dmPelsHeight, testCode = code });
            }
        }
        return results;
    }
    static object Activate(string identity, int width, int height, int fps, string path)
    {
        if (File.Exists(path)) throw new Exception("이전 화면 복구 기록이 있습니다. 복구 후 다시 연결하세요.");
        if (width < 640 || width > 3840 || height < 480 || height > 2160 || fps < 24 || fps > 60)
            throw new Exception("허용 범위를 벗어난 화면 모드입니다.");
        var all = List(); var target = Resolve(all, identity);
        var before = DevMode.New();
        if (!EnumDisplaySettingsEx(target.Name, target.Active ? -1 : -2, ref before, 0)) throw new Exception("기존 화면 설정을 읽지 못했습니다.");
        var mode = DevMode.New(); bool found = false;
        for (int i = 0; i < 10000; i++)
        {
            var candidate = DevMode.New();
            if (!EnumDisplaySettingsEx(target.Name, i, ref candidate, 0)) break;
            if (candidate.dmPelsWidth == width && candidate.dmPelsHeight == height && candidate.dmDisplayFrequency == fps && candidate.dmBitsPerPel == 32)
            { mode = candidate; found = true; break; }
        }
        if (!found) throw new Exception($"드라이버에 {width}×{height} {fps}Hz 모드가 없습니다. 드라이버 설정에서 추가하세요.");
        var others = all.Where(d => d.Active && d.Identity != identity).ToArray();
        if (others.Length == 0) throw new Exception("유지할 기존 모니터를 찾지 못했습니다.");
        var rightmost = others.OrderByDescending(d => d.Bounds.X + d.Bounds.Width).First();
        mode.dmPositionX = rightmost.Bounds.X + rightmost.Bounds.Width; mode.dmPositionY = rightmost.Bounds.Y;
        mode.dmFields = Position | Width | Height | Bits | Frequency | Orientation;
        Check(ChangeDisplaySettingsEx(target.Name, ref mode, IntPtr.Zero, 2, IntPtr.Zero), "화면 모드 사전 검사");
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
        var snapshot = new Snapshot(1, identity, target.Active, before, mode);
        // Write-through journal must exist before changing the display.
        using (var file = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
        { JsonSerializer.Serialize(file, snapshot, Json); file.Flush(true); }
        Check(ChangeDisplaySettingsEx(target.Name, ref mode, IntPtr.Zero, 0, IntPtr.Zero), "화면 확장");
        var active = Resolve(List(), identity);
        if (!active.Active || active.Bounds != new Bounds(mode.dmPositionX, mode.dmPositionY, width, height))
            throw new Exception("화면 확장 결과가 요청과 다릅니다. 복구를 실행하세요.");
        return active;
    }
    static object Restore(string path)
    {
        if (!File.Exists(path)) return new { restored = false };
        var saved = JsonSerializer.Deserialize<Snapshot>(File.ReadAllText(path), Json) ?? throw new Exception("복구 기록을 읽지 못했습니다.");
        if (saved.Version != 1) throw new Exception("알 수 없는 복구 기록 버전입니다.");
        var target = Resolve(List(), saved.Identity);
        var mode = saved.Before;
        mode.dmSize = (ushort)Marshal.SizeOf<DevMode>(); mode.dmDriverExtra = 0;
        mode.dmFields = Position | Width | Height | Bits | Frequency | Orientation;
        if (!saved.WasActive)
        { mode.dmPelsWidth = 0; mode.dmPelsHeight = 0; mode.dmFields = Position | Width | Height; }
        Check(ChangeDisplaySettingsEx(target.Name, ref mode, IntPtr.Zero, 0, IntPtr.Zero), "기존 화면 복구");
        var after = Resolve(List(), saved.Identity);
        if (after.Active != saved.WasActive || (saved.WasActive && (after.Bounds != new Bounds(saved.Before.dmPositionX, saved.Before.dmPositionY, (int)saved.Before.dmPelsWidth, (int)saved.Before.dmPelsHeight) || after.Frequency != saved.Before.dmDisplayFrequency)))
            throw new Exception("복구 결과를 확인하지 못했습니다. 복구 기록을 유지합니다.");
        File.Delete(path);
        return new { restored = true };
    }
    static object RestoreAuto(string path)
    {
        if (!File.Exists(path)) return new { restored = false };
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        if (root.TryGetProperty("Paths", out _) || root.TryGetProperty("paths", out _))
            return CcdDiagnostic.Restore(path);
        return Restore(path);
    }
    static void Check(int code, string action) { if (code != 0) throw new Exception($"{action} 실패 (Windows 코드 {code})."); }
    static object SelfTest()
    {
        if (Marshal.SizeOf<DevMode>() != 220 || Marshal.SizeOf<Device>() != 840) throw new Exception("Win32 structure size mismatch");
        var mode = DevMode.New(); mode.dmPositionX = -1440; mode.dmPelsWidth = 1440;
        var encoded = JsonSerializer.Serialize(new Snapshot(1, "stable-id", true, mode, mode), Json);
        var restored = JsonSerializer.Deserialize<Snapshot>(encoded, Json)!;
        if (restored.Before.dmPositionX != -1440 || restored.Before.dmPelsWidth != 1440) throw new Exception("Snapshot roundtrip failed");
        return new { passed = true, devModeSize = Marshal.SizeOf<DevMode>(), deviceSize = Marshal.SizeOf<Device>() };
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct Device
    {
        public uint cb;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
        public uint StateFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
        public static Device New() => new() { cb = (uint)Marshal.SizeOf<Device>(), DeviceName = "", DeviceString = "", DeviceID = "", DeviceKey = "" };
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct DevMode
    {
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
        public ushort dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
        public uint dmFields;
        public int dmPositionX, dmPositionY;
        public uint dmDisplayOrientation, dmDisplayFixedOutput;
        public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
        public ushort dmLogPixels;
        public uint dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency, dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
        public static DevMode New() => new() { dmSize = (ushort)Marshal.SizeOf<DevMode>(), dmDeviceName = "", dmFormName = "" };
    }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string? device, uint i, ref Device data, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplaySettingsEx(string name, int mode, ref DevMode data, uint flags);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int ChangeDisplaySettingsEx(string name, ref DevMode mode, IntPtr hwnd, uint flags, IntPtr param);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
}
