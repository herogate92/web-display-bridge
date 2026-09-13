using System.Runtime.InteropServices;
using System.Text.Json;

// Windows CCD (Connecting and Configuring Displays) implementation.
// It preserves the complete active topology and changes only the selected target.
internal static class CcdDiagnostic
{
    const uint InvalidMode = uint.MaxValue;
    const uint QueryAllPaths = 1, QueryOnlyActive = 2;
    const uint PathActive = 1;
    const uint UseSuppliedConfig = 0x20, Validate = 0x40, Apply = 0x80;

    [StructLayout(LayoutKind.Sequential)] public struct Luid { public uint Low; public int High; }
    [StructLayout(LayoutKind.Sequential)] public struct Source { public Luid Adapter; public uint Id, Mode, Status; }
    [StructLayout(LayoutKind.Sequential)] public struct Target {
        public Luid Adapter; public uint Id, Mode, Technology, Rotation, Scaling, Numerator, Denominator, Scanline;
        public int Available; public uint Status;
    }
    [StructLayout(LayoutKind.Sequential)] public struct DisplayPath { public Source Source; public Target Target; public uint Flags; }
    [StructLayout(LayoutKind.Explicit, Size=64)] public struct Mode {
        [FieldOffset(0)] public uint Type; [FieldOffset(4)] public uint Id; [FieldOffset(8)] public Luid Adapter;
        [FieldOffset(16)] public uint Width; [FieldOffset(20)] public uint Height; [FieldOffset(24)] public uint Format;
        [FieldOffset(28)] public int X; [FieldOffset(32)] public int Y;
        [FieldOffset(16)] public ulong Raw0; [FieldOffset(24)] public ulong Raw1; [FieldOffset(32)] public ulong Raw2;
        [FieldOffset(40)] public ulong Raw3; [FieldOffset(48)] public ulong Raw4; [FieldOffset(56)] public ulong Raw5;
    }
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] struct TargetName {
        public uint Type, Size; public Luid Adapter; public uint Id, Flags, Technology;
        public ushort Manufacturer, Product; public uint Connector;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)] public string Friendly;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=128)] public string DevicePath;
    }

    public record Saved(int Version, DisplayPath[] Paths, Mode[] Modes);
    static readonly JsonSerializerOptions Json = new() { IncludeFields = true };

    static (DisplayPath[] Paths, Mode[] Modes) Query(uint flags)
    {
        for (int retry=0; retry<4; retry++) {
            Check(GetDisplayConfigBufferSizes(flags, out uint pc, out uint mc), "CCD buffer sizes");
            var paths = new DisplayPath[pc]; var modes = new Mode[mc];
            int code = QueryDisplayConfig(flags, ref pc, paths, ref mc, modes, IntPtr.Zero);
            if (code == 122) continue;
            Check(code, "CCD query");
            return (paths.Take((int)pc).ToArray(), modes.Take((int)mc).ToArray());
        }
        throw new Exception("화면 구성이 계속 변경되어 작업을 중지했습니다.");
    }

    static string Name(DisplayPath path)
    {
        var name = new TargetName { Type=2, Size=(uint)Marshal.SizeOf<TargetName>(), Adapter=path.Target.Adapter, Id=path.Target.Id, Friendly="", DevicePath="" };
        Check(DisplayConfigGetDeviceInfo(ref name), "CCD target identity");
        return name.DevicePath;
    }

    static bool IsTarget(DisplayPath path, string identity) => Name(path).Equals(identity, StringComparison.OrdinalIgnoreCase);
    static bool SameSource(Source a, Source b) => a.Id==b.Id && a.Adapter.Low==b.Adapter.Low && a.Adapter.High==b.Adapter.High;
    static int Set(DisplayPath[] paths, Mode[] modes, uint action) =>
        SetDisplayConfig((uint)paths.Length, paths, (uint)modes.Length, modes, UseSuppliedConfig | action);
    static void Check(int code, string step) {
        if(code!=0) throw new Exception($"{step}: Windows 오류 {code} ({new System.ComponentModel.Win32Exception(code).Message})");
    }

    static object Describe((DisplayPath[] Paths, Mode[] Modes) config) => new {
        paths=config.Paths.Select(p => new { identity=Name(p), flags=p.Flags, source=p.Source, target=p.Target }).ToArray(),
        modes=config.Modes
    };

    static Mode SourceMode(DisplayPath path, Mode[] modes)
    {
        if (path.Source.Mode == InvalidMode || path.Source.Mode >= modes.Length || modes[path.Source.Mode].Type != 1)
            throw new Exception("선택한 화면의 현재 해상도 정보를 찾지 못했습니다.");
        return modes[path.Source.Mode];
    }

    static (DisplayPath[] Paths, Mode[] Modes) BuildRequested(
        string identity, int width, int height, int fps,
        (DisplayPath[] Paths, Mode[] Modes) current,
        (DisplayPath[] Paths, Mode[] Modes) all)
    {
        int activeIndex = Array.FindIndex(current.Paths, p => IsTarget(p, identity));
        if (activeIndex >= 0) {
            var selected = current.Paths[activeIndex];
            if (current.Paths.Where((_, i) => i != activeIndex).Any(p => SameSource(p.Source, selected.Source)))
                throw new Exception("선택한 가상 화면이 다른 화면과 복제 중이어서 해상도를 바꿀 수 없습니다.");

            var paths = current.Paths.ToArray();
            var modes = current.Modes.ToArray();
            var sourceMode = SourceMode(selected, modes);
            sourceMode.Width = (uint)width;
            sourceMode.Height = (uint)height;
            modes[selected.Source.Mode] = sourceMode;

            selected.Flags |= PathActive;
            selected.Target.Mode = InvalidMode; // Let the driver choose timing for the registered custom mode.
            selected.Target.Numerator = (uint)fps;
            selected.Target.Denominator = 1;
            paths[activeIndex] = selected;
            return (paths, modes);
        }

        var available = all.Paths
            .Where(p => p.Target.Available != 0 && IsTarget(p, identity))
            .Where(p => !current.Paths.Any(c => SameSource(c.Source, p.Source)))
            .ToArray();
        if (available.Length == 0)
            throw new Exception("가상 화면을 켤 독립된 Windows 화면 경로를 찾지 못했습니다.");

        var added = available[0];
        added.Flags |= PathActive;
        var sourceModes = current.Modes.Where(m => m.Type == 1).ToArray();
        if (sourceModes.Length == 0) throw new Exception("현재 사용 중인 기본 모니터 위치를 읽지 못했습니다.");
        var edge = sourceModes.OrderByDescending(m => m.X + (long)m.Width).First();
        var mode = new Mode {
            Type=1, Id=added.Source.Id, Adapter=added.Source.Adapter,
            Width=(uint)width, Height=(uint)height, Format=4,
            X=checked(edge.X+(int)edge.Width), Y=edge.Y
        };
        added.Source.Mode=(uint)current.Modes.Length;
        added.Target.Mode=InvalidMode;
        added.Target.Numerator=(uint)fps;
        added.Target.Denominator=1;
        if (added.Target.Rotation == 0) added.Target.Rotation=1;
        if (added.Target.Scaling == 0) added.Target.Scaling=1;
        if (added.Target.Scanline == 0) added.Target.Scanline=1;
        return (current.Paths.Append(added).ToArray(), current.Modes.Append(mode).ToArray());
    }

    static void SaveRecovery(string file, (DisplayPath[] Paths, Mode[] Modes) current)
    {
        // The first session owns the original topology. Additional sessions must
        // keep that journal intact so a final restore returns to the real layout.
        if(File.Exists(file)) return;
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(file))!);
        using var stream=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.None,4096,FileOptions.WriteThrough);
        JsonSerializer.Serialize(stream,new Saved(2,current.Paths,current.Modes),Json);
        stream.Flush(true);
    }

    static object Execute(string identity, int width, int height, int fps, string file, bool apply)
    {
        if (Marshal.SizeOf<DisplayPath>()!=72 || Marshal.SizeOf<Mode>()!=64 || Marshal.SizeOf<TargetName>()!=420)
            throw new Exception("CCD 구조 크기가 현재 Windows와 맞지 않습니다.");
        if (width < 640 || width > 3840 || height < 480 || height > 2160 || fps < 24 || fps > 60)
            throw new Exception("허용 범위를 벗어난 화면 모드입니다.");

        var current=Query(QueryOnlyActive);
        var all=Query(QueryAllPaths);
        if (!all.Paths.Any(p => IsTarget(p, identity)))
            throw new Exception("CCD에서 선택한 가상 모니터를 찾지 못했습니다.");
        var requested=BuildRequested(identity,width,height,fps,current,all);

        int control=Set(current.Paths,current.Modes,Validate);
        Check(control,"현재 화면 구성 사전 검사");
        int validation=Set(requested.Paths,requested.Modes,Validate);
        if (validation != 0)
            throw new Exception($"{width}×{height} {fps}Hz 화면 구성 사전 검사 실패: Windows 오류 {validation} ({new System.ComponentModel.Win32Exception(validation).Message})");
        if (!apply) return new { control, validation, applied=false };

        bool createdRecovery = !File.Exists(file);
        SaveRecovery(file,current);
        int result=Set(requested.Paths,requested.Modes,Apply);
        if(result!=0) {
            int rollback=Set(current.Paths,current.Modes,Apply);
            if(rollback==0 && createdRecovery) File.Delete(file);
            throw new Exception($"가상 화면 적용 실패: Windows 오류 {result}; 원래 화면 복구 결과 {rollback}");
        }

        var observations = new List<object>();
        int consecutive = 0;
        try {
            for(int attempt=0; attempt<20; attempt++) {
                var after=Query(QueryOnlyActive);
                var matches=after.Paths.Where(p=>IsTarget(p,identity)).ToArray();
                bool present=matches.Length==1;
                bool sizeMatches=false, rateMatches=false;
                if(present) {
                    var path=matches[0];
                    var sm=SourceMode(path,after.Modes);
                    sizeMatches=sm.Width==width && sm.Height==height;
                    double rate=path.Target.Denominator==0 ? 0 : (double)path.Target.Numerator/path.Target.Denominator;
                    rateMatches=Math.Abs(rate-fps)<0.6;
                }
                bool exact=present && sizeMatches && rateMatches;
                observations.Add(new { elapsedMs=attempt*250, present, sizeMatches, rateMatches });
                consecutive=exact ? consecutive+1 : 0;
                if(consecutive>=4) {
                    File.WriteAllText(file+".trace.json",JsonSerializer.Serialize(new { before=Describe(current), requested=Describe(requested), observations },Json));
                    return new { applied=true, width, height, fps, recoveryFile=file };
                }
                Thread.Sleep(250);
            }
            int rollback=Set(current.Paths,current.Modes,Apply);
            if(rollback==0 && createdRecovery) File.Delete(file);
            File.WriteAllText(file+".trace.json",JsonSerializer.Serialize(new { before=Describe(current), requested=Describe(requested), observations, rollback },Json));
            throw new Exception($"가상 화면이 {width}×{height} {fps}Hz로 유지되지 않았습니다. 원래 화면 복구 결과 {rollback}");
        } catch {
            if (createdRecovery && File.Exists(file)) {
                int rollback=Set(current.Paths,current.Modes,Apply);
                if(rollback==0) File.Delete(file);
            }
            throw;
        }
    }

    public static object Activate(string identity, int width, int height, int fps, string file) =>
        Execute(identity,width,height,fps,file,true);

    public static object ValidateMode(string identity, int width, int height, int fps, string file) =>
        Execute(identity,width,height,fps,file,false);

    public static object Deactivate(string identity)
    {
        var current=Query(QueryOnlyActive);
        var paths=current.Paths.Where(p=>!IsTarget(p,identity)).ToArray();
        if(paths.Length==current.Paths.Length) return new { deactivated=false };
        if(paths.Length==0) throw new Exception("기본 모니터까지 제거될 수 있어 작업을 중지했습니다.");

        var referenced=new SortedSet<uint>();
        foreach(var path in paths) {
            if(path.Source.Mode!=InvalidMode) referenced.Add(path.Source.Mode);
            if(path.Target.Mode!=InvalidMode) referenced.Add(path.Target.Mode);
        }
        var remap=referenced.Select((old,index)=>(old,index)).ToDictionary(x=>x.old,x=>(uint)x.index);
        var compactModes=referenced.Select(index=>current.Modes[index]).ToArray();
        for(int i=0;i<paths.Length;i++) {
            var path=paths[i];
            if(path.Source.Mode!=InvalidMode) path.Source.Mode=remap[path.Source.Mode];
            if(path.Target.Mode!=InvalidMode) path.Target.Mode=remap[path.Target.Mode];
            paths[i]=path;
        }
        Check(Set(paths,compactModes,Validate),"가상 화면 종료 사전 검사");
        Check(Set(paths,compactModes,Apply),"가상 화면 종료");
        return new { deactivated=true };
    }

    // Kept for the standalone diagnostic script.
    public static object Run(string identity, string file, bool apply) =>
        Execute(identity,1920,1080,60,file,apply);

    public static object Restore(string file)
    {
        if (!File.Exists(file)) return new { restored=false };
        var saved=JsonSerializer.Deserialize<Saved>(File.ReadAllText(file),Json) ?? throw new Exception("CCD 복구 기록을 읽지 못했습니다.");
        if(saved.Version is not (1 or 2)) throw new Exception("알 수 없는 CCD 복구 기록 버전입니다.");
        Check(Set(saved.Paths,saved.Modes,Apply),"CCD 화면 복구");
        File.Delete(file);
        return new { restored=true };
    }

    [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags,out uint paths,out uint modes);
    [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags,ref uint pc,[Out] DisplayPath[] paths,ref uint mc,[Out] Mode[] modes,IntPtr topology);
    [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(ref TargetName name);
    [DllImport("user32.dll")] static extern int SetDisplayConfig(uint pc,[In] DisplayPath[] paths,uint mc,[In] Mode[] modes,uint flags);
}
